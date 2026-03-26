import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SelfPlayEngine } from '../src/engine/self-play.js';

describe('Self-Play Evolution', () => {
  let db: Database.Database;
  let sp: SelfPlayEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS genes (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT, category TEXT, strategy TEXT, q_value REAL DEFAULT 0.5, platforms TEXT DEFAULT '[]', success_count INTEGER DEFAULT 3, consecutive_failures INTEGER DEFAULT 0, avg_repair_ms REAL DEFAULT 5, conditions TEXT DEFAULT '{}', anti_conditions TEXT DEFAULT '{}')`);
    const ins = db.prepare('INSERT INTO genes (failure_code, category, strategy, q_value, platforms) VALUES (?,?,?,?,?)');
    ins.run('nonce-mismatch', 'nonce', 'refresh_nonce', 0.8, '["tempo","coinbase"]');
    ins.run('gas-estimation-failed', 'gas', 'speed_up_transaction', 0.7, '["coinbase"]');
    ins.run('rate-limited', 'rate-limited', 'backoff_retry', 0.9, '["generic","coinbase"]');
    ins.run('insufficient-balance', 'balance', 'reduce_request', 0.6, '["tempo","privy"]');
    ins.run('session-expired', 'session', 'renew_session', 0.75, '["privy"]');
    sp = new SelfPlayEngine(db);
  });
  afterEach(() => db.close());

  it('generateChallenge returns valid challenge', () => {
    const c = sp.generateChallenge();
    expect(c.id).toBeTruthy();
    expect(c.errorMessage).toBeTruthy();
    expect(c.platform).toBeTruthy();
    expect(['easy', 'medium', 'hard']).toContain(c.difficulty);
  });

  it('generates diverse challenges', () => {
    const msgs = new Set<string>();
    for (let i = 0; i < 10; i++) msgs.add(sp.generateChallenge().errorMessage);
    expect(msgs.size).toBeGreaterThanOrEqual(3);
  });

  it('verify returns true for matching category', () => {
    const c = { id: '1', errorMessage: 'test', platform: 'generic', expectedCategory: 'nonce', difficulty: 'easy' as const, mutationType: 'keyword-swap' as const };
    const a = { challengeId: '1', strategy: 'refresh_nonce', code: 'nonce', category: 'nonce', confidence: 0.8, durationMs: 1, source: 'gene-map' };
    expect(sp.verify(c, a)).toBe(true);
  });

  it('verify returns false for wrong category and strategy', () => {
    const c = { id: '1', errorMessage: 'test', platform: 'generic', expectedCategory: 'nonce', difficulty: 'easy' as const, mutationType: 'keyword-swap' as const };
    const a = { challengeId: '1', strategy: 'reduce_request', code: 'unknown', category: 'unknown', confidence: 0.3, durationMs: 1, source: 'gene-map' };
    expect(sp.verify(c, a)).toBe(false);
  });

  it('runSession completes all rounds', async () => {
    const s = await sp.runSession(5);
    expect(s.completed).toBe(5);
    expect(s.repaired + s.failed).toBe(5);
    expect(s.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records history', async () => {
    await sp.runSession(3);
    expect(sp.getHistory().length).toBe(3);
  });

  it('getStats returns correct counts', async () => {
    await sp.runSession(5);
    const s = sp.getStats();
    expect(s.total).toBe(5);
    expect(s.repaired + s.failed).toBe(5);
    expect(s.successRate).toBeGreaterThanOrEqual(0);
    expect(s.successRate).toBeLessThanOrEqual(1);
  });

  it('weaknesses recorded for failures', async () => {
    const s = await sp.runSession(10);
    if (s.failed > 0) expect(s.weaknesses.length).toBeGreaterThan(0);
  });

  it('attemptRepair finds strategy via Gene Map', () => {
    const c = { id: '1', errorMessage: 'nonce mismatch', platform: 'tempo', expectedCategory: 'nonce', difficulty: 'easy' as const, mutationType: 'keyword-swap' as const };
    const a = sp.attemptRepair(c);
    expect(a).not.toBeNull();
    expect(a!.source).toBe('gene-map');
  });
});
