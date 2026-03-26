import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FederatedLearner } from '../src/engine/federated.js';

describe('Federated Gene Learning', () => {
  let db: Database.Database;
  let fl: FederatedLearner;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS genes (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT, category TEXT, strategy TEXT, q_value REAL DEFAULT 0.5, platforms TEXT DEFAULT '[]', success_count INTEGER DEFAULT 5, failure_count INTEGER DEFAULT 1, consecutive_failures INTEGER DEFAULT 0, avg_repair_ms REAL DEFAULT 5, conditions TEXT DEFAULT '{}', anti_conditions TEXT DEFAULT '{}')`);
    const ins = db.prepare('INSERT INTO genes (failure_code, category, strategy, q_value, success_count, failure_count) VALUES (?,?,?,?,?,?)');
    ins.run('nonce-mismatch', 'nonce', 'refresh_nonce', 0.8, 10, 2);
    ins.run('gas-spike', 'gas', 'speed_up_transaction', 0.6, 8, 4);
    ins.run('rate-limited', 'rate-limited', 'backoff_retry', 0.9, 15, 1);
    ins.run('rare-error', 'unknown', 'retry', 0.5, 1, 0);
    fl = new FederatedLearner(db, 1.0);
  });
  afterEach(() => db.close());

  it('computes gradients for genes with enough samples', () => {
    const g = fl.computeGradients(3);
    expect(g.length).toBeLessThanOrEqual(3);
    expect(g.length).toBeGreaterThan(0);
  });

  it('adds differential privacy noise', () => {
    const g = fl.computeGradients(3);
    for (const x of g) expect(typeof x.noise).toBe('number');
  });

  it('pushGradients stores them', () => {
    const g = fl.computeGradients(3);
    expect(fl.pushGradients(g)).toBe(g.length);
    expect((db.prepare('SELECT COUNT(*) as c FROM shared_gradients').get() as any).c).toBe(g.length);
  });

  it('pullGlobalGradients aggregates with FedAvg', () => {
    db.prepare('INSERT INTO shared_gradients (failure_code, category, strategy, q_delta, sample_count) VALUES (?,?,?,?,?)').run('nonce-mismatch', 'nonce', 'refresh_nonce', 0.1, 10);
    db.prepare('INSERT INTO shared_gradients (failure_code, category, strategy, q_delta, sample_count) VALUES (?,?,?,?,?)').run('nonce-mismatch', 'nonce', 'refresh_nonce', 0.2, 20);
    const g = fl.pullGlobalGradients();
    const n = g.find(x => x.failureCode === 'nonce-mismatch');
    expect(n).toBeDefined();
    expect(n!.qDelta).toBeCloseTo(0.167, 1);
    expect(n!.sampleCount).toBe(30);
  });

  it('applyGlobalGradients updates Q-values', () => {
    const orig = (db.prepare("SELECT q_value FROM genes WHERE failure_code = 'nonce-mismatch'").get() as any).q_value;
    fl.applyGlobalGradients([{ failureCode: 'nonce-mismatch', category: 'nonce', strategy: 'refresh_nonce', qDelta: 0.1, sampleCount: 50 }], 0.3);
    const newQ = (db.prepare("SELECT q_value FROM genes WHERE failure_code = 'nonce-mismatch'").get() as any).q_value;
    expect(newQ).toBeCloseTo(orig + 0.3 * 0.1, 2);
  });

  it('clamps Q between 0 and 1', () => {
    fl.applyGlobalGradients([{ failureCode: 'rate-limited', category: 'rate-limited', strategy: 'backoff_retry', qDelta: 0.5, sampleCount: 100 }], 1.0);
    expect((db.prepare("SELECT q_value FROM genes WHERE failure_code = 'rate-limited'").get() as any).q_value).toBeLessThanOrEqual(1.0);
  });

  it('federatedRound runs complete cycle', async () => {
    const r = await fl.federatedRound();
    expect(r.gradientsComputed).toBeGreaterThanOrEqual(0);
    expect(r.gradientsPushed).toBe(r.gradientsComputed);
  });

  it('getStats returns epsilon', () => {
    expect(fl.getStats().epsilon).toBe(1.0);
  });

  it('excludes genes with < minSamples', () => {
    expect(fl.computeGradients(20).length).toBe(0);
  });
});
