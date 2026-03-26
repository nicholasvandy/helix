/**
 * Federated Gene Learning — privacy-preserving distributed RL.
 * Agents share Q-value gradients (not raw data) with differential privacy.
 */
import type Database from 'better-sqlite3';

export interface GeneGradient { failureCode: string; category: string; strategy: string; qDelta: number; sampleCount: number; noise?: number }
export interface FederatedResult { gradientsComputed: number; gradientsPushed: number; gradientsPulled: number; gradientsApplied: number; genesUpdated: number }

export class FederatedLearner {
  private db: Database.Database;
  private epsilon: number;

  constructor(db: Database.Database, epsilon = 1.0) {
    this.db = db;
    this.epsilon = epsilon;
    db.exec(`CREATE TABLE IF NOT EXISTS gradient_log (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT NOT NULL, q_before REAL NOT NULL, q_after REAL NOT NULL, q_delta REAL NOT NULL, recorded_at INTEGER DEFAULT (unixepoch()))`);
    db.exec(`CREATE TABLE IF NOT EXISTS global_gradients (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT NOT NULL, avg_q_delta REAL NOT NULL, total_samples INTEGER DEFAULT 0, agent_count INTEGER DEFAULT 0, received_at INTEGER DEFAULT (unixepoch()), applied INTEGER DEFAULT 0, UNIQUE(failure_code, category, strategy))`);
    db.exec(`CREATE TABLE IF NOT EXISTS shared_gradients (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT NOT NULL, q_delta REAL NOT NULL, noise REAL DEFAULT 0, sample_count INTEGER DEFAULT 0, shared_at INTEGER DEFAULT (unixepoch()))`);
  }

  private laplace(b: number): number { const u = Math.random() - 0.5; return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u)); }

  computeGradients(minSamples = 3): GeneGradient[] {
    const genes = this.db.prepare('SELECT failure_code, category, strategy, q_value, success_count, COALESCE(failure_count, 0) as failure_count FROM genes WHERE success_count + COALESCE(failure_count, 0) >= ?').all(minSamples) as any[];
    const gradients: GeneGradient[] = [];
    for (const g of genes) {
      const last = this.db.prepare('SELECT q_after FROM gradient_log WHERE failure_code = ? AND category = ? AND strategy = ? ORDER BY recorded_at DESC LIMIT 1').get(g.failure_code, g.category, g.strategy) as any;
      const qBefore = last ? last.q_after : 0.5;
      const qDelta = g.q_value - qBefore;
      if (Math.abs(qDelta) < 0.01) continue;
      const noise = this.laplace(1.0 / this.epsilon);
      gradients.push({ failureCode: g.failure_code, category: g.category, strategy: g.strategy, qDelta: Math.round((qDelta + noise) * 1000) / 1000, sampleCount: g.success_count + (g.failure_count || 0), noise: Math.round(noise * 1000) / 1000 });
      this.db.prepare('INSERT INTO gradient_log (failure_code, category, strategy, q_before, q_after, q_delta) VALUES (?,?,?,?,?,?)').run(g.failure_code, g.category, g.strategy, qBefore, g.q_value, qDelta);
    }
    return gradients;
  }

  pushGradients(gradients: GeneGradient[]): number {
    const stmt = this.db.prepare('INSERT INTO shared_gradients (failure_code, category, strategy, q_delta, noise, sample_count) VALUES (?,?,?,?,?,?)');
    for (const g of gradients) stmt.run(g.failureCode, g.category, g.strategy, g.qDelta, g.noise ?? 0, g.sampleCount);
    return gradients.length;
  }

  pullGlobalGradients(): GeneGradient[] {
    const agg = this.db.prepare('SELECT failure_code, category, strategy, SUM(q_delta * sample_count) / SUM(sample_count) as avg_delta, SUM(sample_count) as total_samples, COUNT(*) as agent_count FROM shared_gradients GROUP BY failure_code, category, strategy').all() as any[];
    const gradients: GeneGradient[] = [];
    for (const a of agg) {
      this.db.prepare('INSERT INTO global_gradients (failure_code, category, strategy, avg_q_delta, total_samples, agent_count) VALUES (?,?,?,?,?,?) ON CONFLICT(failure_code, category, strategy) DO UPDATE SET avg_q_delta = excluded.avg_q_delta, total_samples = excluded.total_samples, agent_count = excluded.agent_count, received_at = unixepoch(), applied = 0').run(a.failure_code, a.category, a.strategy, a.avg_delta, a.total_samples, a.agent_count);
      gradients.push({ failureCode: a.failure_code, category: a.category, strategy: a.strategy, qDelta: Math.round(a.avg_delta * 1000) / 1000, sampleCount: a.total_samples });
    }
    return gradients;
  }

  applyGlobalGradients(gradients: GeneGradient[], learningRate = 0.3): number {
    let updated = 0;
    for (const g of gradients) {
      const gene = this.db.prepare('SELECT id, q_value FROM genes WHERE failure_code = ? AND category = ? AND strategy = ?').get(g.failureCode, g.category, g.strategy) as any;
      if (!gene) continue;
      const newQ = Math.max(0, Math.min(1, Math.round((gene.q_value + learningRate * g.qDelta) * 1000) / 1000));
      this.db.prepare('UPDATE genes SET q_value = ? WHERE id = ?').run(newQ, gene.id);
      updated++;
    }
    this.db.prepare('UPDATE global_gradients SET applied = 1 WHERE applied = 0').run();
    return updated;
  }

  async federatedRound(): Promise<FederatedResult> {
    const local = this.computeGradients();
    const pushed = this.pushGradients(local);
    const global = this.pullGlobalGradients();
    const updated = this.applyGlobalGradients(global);
    return { gradientsComputed: local.length, gradientsPushed: pushed, gradientsPulled: global.length, gradientsApplied: global.length, genesUpdated: updated };
  }

  getStats() {
    return {
      localGradients: (this.db.prepare('SELECT COUNT(*) as c FROM gradient_log').get() as any).c,
      sharedGradients: (this.db.prepare('SELECT COUNT(*) as c FROM shared_gradients').get() as any).c,
      globalGradients: (this.db.prepare('SELECT COUNT(*) as c FROM global_gradients').get() as any).c,
      appliedGradients: (this.db.prepare('SELECT COUNT(*) as c FROM global_gradients WHERE applied = 1').get() as any).c,
      epsilon: this.epsilon,
    };
  }
}
