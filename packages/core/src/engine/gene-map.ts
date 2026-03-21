import Database from 'better-sqlite3';
import type { ErrorCode, FailureCategory, GeneCapsule, Platform } from './types.js';
import { SEED_GENES } from './seed-genes.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS genes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  failure_code TEXT NOT NULL,
  category TEXT NOT NULL,
  strategy TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  success_count INTEGER NOT NULL DEFAULT 1,
  avg_repair_ms REAL NOT NULL DEFAULT 0,
  platforms TEXT NOT NULL DEFAULT '[]',
  q_value REAL NOT NULL DEFAULT 0.5,
  last_success_at INTEGER,
  last_failed_at INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(failure_code, category)
);

CREATE TABLE IF NOT EXISTS repair_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repair_id TEXT UNIQUE NOT NULL,
  failure_code TEXT NOT NULL,
  category TEXT NOT NULL,
  strategy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  completed_at DATETIME
);
`;

function parseRow(row: Record<string, unknown>): GeneCapsule {
  return {
    id: row.id as number,
    failureCode: row.failure_code as ErrorCode,
    category: row.category as FailureCategory,
    strategy: row.strategy as string,
    params: JSON.parse(row.params as string),
    successCount: row.success_count as number,
    avgRepairMs: row.avg_repair_ms as number,
    platforms: JSON.parse(row.platforms as string) as Platform[],
    qValue: row.q_value as number,
    consecutiveFailures: row.consecutive_failures as number,
    lastSuccessAt: row.last_success_at as number | undefined,
    lastFailedAt: row.last_failed_at as number | undefined,
    createdAt: row.created_at as string,
    lastUsedAt: row.last_used_at as string,
  };
}

export class GeneMap {
  private db: Database.Database;
  private stmtLookup: Database.Statement;
  private stmtUpsert: Database.Statement;
  private stmtList: Database.Statement;
  private stmtCount: Database.Statement;
  private stmtUpdatePlatforms: Database.Statement;

  // L1 in-memory cache (OPT-9)
  private cache: Map<string, Record<string, unknown>> = new Map();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);

    this.stmtLookup = this.db.prepare(`SELECT * FROM genes WHERE failure_code = ? AND category = ? ORDER BY q_value DESC LIMIT 1`);
    this.stmtUpsert = this.db.prepare(`
      INSERT INTO genes (failure_code, category, strategy, params, success_count, avg_repair_ms, platforms, q_value, consecutive_failures)
      VALUES (@failureCode, @category, @strategy, @params, @successCount, @avgRepairMs, @platforms, @qValue, @consecutiveFailures)
      ON CONFLICT(failure_code, category) DO UPDATE SET
        strategy = @strategy, params = @params,
        success_count = success_count + 1,
        avg_repair_ms = (avg_repair_ms * success_count + @avgRepairMs) / (success_count + 1),
        platforms = @platforms, q_value = @qValue, consecutive_failures = @consecutiveFailures,
        last_used_at = datetime('now')
    `);
    this.stmtList = this.db.prepare(`SELECT * FROM genes ORDER BY q_value DESC, success_count DESC`);
    this.stmtCount = this.db.prepare(`SELECT COUNT(*) as count FROM genes`);
    this.stmtUpdatePlatforms = this.db.prepare(`UPDATE genes SET platforms = ?, last_used_at = datetime('now') WHERE failure_code = ? AND category = ?`);

    // Seed on first run + warm cache
    this.seed();
    this.warmCache();
  }

  // ── L1 Cache (OPT-9) ──

  private cacheKey(code: string, category: string): string { return `${code}:${category}`; }

  private warmCache(): void {
    this.cache.clear();
    for (const row of this.db.prepare('SELECT * FROM genes').all() as Record<string, unknown>[]) {
      this.cache.set(this.cacheKey(row.failure_code as string, row.category as string), row);
    }
    this.cacheLoadedAt = Date.now();
  }

  private isCacheStale(): boolean { return Date.now() - this.cacheLoadedAt > this.CACHE_TTL_MS; }

  // ── Core CRUD ──

  lookup(code: ErrorCode, category: FailureCategory): GeneCapsule | null {
    const key = this.cacheKey(code, category);

    // L1 cache hit
    if (!this.isCacheStale() && this.cache.has(key)) {
      const cached = this.cache.get(key)!;
      this.db.prepare(`UPDATE genes SET last_used_at = datetime('now'), success_count = success_count + 1 WHERE failure_code = ? AND category = ?`).run(code, category);
      const gene = parseRow(cached);
      gene.successCount += 1;
      return gene;
    }

    // L2: SQLite
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return null;
    this.db.prepare(`UPDATE genes SET last_used_at = datetime('now'), success_count = success_count + 1 WHERE failure_code = ? AND category = ?`).run(code, category);
    this.cache.set(key, row);
    const gene = parseRow(row);
    gene.successCount += 1;
    return gene;
  }

  addPlatform(code: ErrorCode, category: FailureCategory, platform: Platform): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    const platforms: Platform[] = JSON.parse(row.platforms as string);
    if (!platforms.includes(platform)) {
      platforms.push(platform);
      this.stmtUpdatePlatforms.run(JSON.stringify(platforms), code, category);
      this.cache.delete(this.cacheKey(code, category)); // invalidate
    }
  }

  store(gene: GeneCapsule): void {
    this.stmtUpsert.run({
      failureCode: gene.failureCode, category: gene.category, strategy: gene.strategy,
      params: JSON.stringify(gene.params, (_k, v) => typeof v === 'bigint' ? v.toString() : v),
      successCount: gene.successCount, avgRepairMs: gene.avgRepairMs,
      platforms: JSON.stringify(gene.platforms),
      qValue: gene.qValue ?? 0.5, consecutiveFailures: gene.consecutiveFailures ?? 0,
    });
    this.cache.delete(this.cacheKey(gene.failureCode, gene.category)); // invalidate
  }

  recordSuccess(code: string, category: string, repairMs: number): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    const newQ = (row.q_value as number) + 0.1 * (1.0 - (row.q_value as number));
    this.db.prepare(`UPDATE genes SET q_value = ?, avg_repair_ms = (avg_repair_ms * success_count + ?) / (success_count + 1), success_count = success_count + 1, last_success_at = ?, consecutive_failures = 0, last_used_at = datetime('now') WHERE failure_code = ? AND category = ?`).run(newQ, repairMs, Date.now(), code, category);
    this.cache.delete(this.cacheKey(code, category));
  }

  recordFailure(code: string, category: string): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    const newQ = (row.q_value as number) + 0.1 * (0.0 - (row.q_value as number));
    this.db.prepare(`UPDATE genes SET q_value = ?, last_failed_at = ?, consecutive_failures = consecutive_failures + 1, last_used_at = datetime('now') WHERE failure_code = ? AND category = ?`).run(newQ, Date.now(), code, category);
    this.cache.delete(this.cacheKey(code, category));
  }

  list(): GeneCapsule[] { return (this.stmtList.all() as Record<string, unknown>[]).map(parseRow); }
  immuneCount(): number { return (this.stmtCount.get() as { count: number }).count; }

  getSuccessRate(failureCode: string, strategy: string): number {
    const row = this.db.prepare(`SELECT success_count, q_value FROM genes WHERE failure_code = ? AND strategy = ?`).get(failureCode, strategy) as { success_count: number } | undefined;
    if (!row || row.success_count < 3) return 0.5;
    return Math.min(0.5 + (row.success_count / 100), 0.95);
  }

  stats() {
    const rows = this.stmtList.all() as Record<string, unknown>[];
    const allP = new Set<string>();
    let qSum = 0;
    for (const r of rows) { qSum += r.q_value as number; for (const p of JSON.parse(r.platforms as string)) allP.add(p); }
    return { totalGenes: rows.length, avgQValue: rows.length > 0 ? Math.round((qSum / rows.length) * 100) / 100 : 0, platforms: [...allP], topStrategies: rows.slice(0, 10).map(r => ({ strategy: r.strategy as string, count: r.success_count as number })) };
  }

  // ── Seed (D9: Cold Start) ──

  seed(): { seeded: number } {
    const cnt = (this.db.prepare('SELECT COUNT(*) as cnt FROM genes').get() as { cnt: number }).cnt;
    if (cnt > 0) return { seeded: 0 };
    let seeded = 0;
    const ins = this.db.prepare(`INSERT OR IGNORE INTO genes (failure_code, category, strategy, params, success_count, avg_repair_ms, platforms, q_value, consecutive_failures) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    this.db.transaction(() => {
      for (const g of SEED_GENES) {
        ins.run(g.failureCode, g.category, g.strategy, JSON.stringify(g.params), g.successCount, g.avgRepairMs, JSON.stringify(g.platforms), g.qValue, g.consecutiveFailures);
        seeded++;
      }
    })();
    return { seeded };
  }

  // ── Gene Combine (OPT-3: ELL paper) ──

  combine(): { merged: number } {
    let merged = 0;
    const groups = this.db.prepare(`SELECT failure_code, category, COUNT(*) as cnt FROM genes GROUP BY failure_code, category HAVING cnt > 1`).all() as { failure_code: string; category: string; cnt: number }[];
    for (const g of groups) {
      const genes = this.db.prepare(`SELECT * FROM genes WHERE failure_code = ? AND category = ? ORDER BY q_value DESC`).all(g.failure_code, g.category) as Record<string, unknown>[];
      if (genes.length <= 1) continue;
      const best = genes[0];
      const allP = new Set<string>();
      let totalSC = 0; let weightedMs = 0;
      for (const gn of genes) { totalSC += gn.success_count as number; weightedMs += (gn.avg_repair_ms as number) * (gn.success_count as number); for (const p of JSON.parse(gn.platforms as string)) allP.add(p); }
      const maxQ = Math.max(...genes.map(gn => gn.q_value as number));
      this.db.prepare(`UPDATE genes SET platforms = ?, success_count = ?, avg_repair_ms = ?, q_value = ?, last_used_at = datetime('now') WHERE id = ?`).run(JSON.stringify([...allP]), totalSC, weightedMs / Math.max(totalSC, 1), maxQ, best.id);
      for (const gn of genes.slice(1)) { this.db.prepare('DELETE FROM genes WHERE id = ?').run(gn.id); merged++; }
    }
    if (merged > 0) this.warmCache();
    return { merged };
  }

  gc(): { merged: number; pruned: number; archived: number } {
    const { merged } = this.combine();
    const pruned = this.db.prepare(`DELETE FROM genes WHERE q_value < 0.1 AND consecutive_failures >= 3`).run().changes;
    const archived = (this.db.prepare(`SELECT COUNT(*) as cnt FROM genes WHERE last_used_at < datetime('now', '-180 days')`).get() as { cnt: number }).cnt;
    if (pruned > 0) this.warmCache();
    return { merged, pruned, archived };
  }

  // ── Idempotency (D5) ──

  generateRepairId(): string { return `repair_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  checkRepairInProgress(code: string, category: string): { inProgress: boolean; repairId?: string; txHash?: string } {
    const r = this.db.prepare(`SELECT repair_id, status, tx_hash FROM repair_log WHERE failure_code = ? AND category = ? AND status IN ('pending', 'completed') AND created_at > datetime('now', '-5 minutes') ORDER BY created_at DESC LIMIT 1`).get(code, category) as { repair_id: string; status: string; tx_hash: string } | undefined;
    if (!r) return { inProgress: false };
    if (r.status === 'pending') return { inProgress: true, repairId: r.repair_id };
    if (r.status === 'completed' && r.tx_hash) return { inProgress: true, repairId: r.repair_id, txHash: r.tx_hash };
    return { inProgress: false };
  }

  logRepairStart(repairId: string, code: string, category: string, strategy: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO repair_log (repair_id, failure_code, category, strategy, status) VALUES (?, ?, ?, ?, 'pending')`).run(repairId, code, category, strategy);
  }

  logRepairComplete(repairId: string, txHash?: string): void {
    this.db.prepare(`UPDATE repair_log SET status = 'completed', tx_hash = ?, completed_at = datetime('now') WHERE repair_id = ?`).run(txHash ?? null, repairId);
  }

  logRepairFailed(repairId: string): void {
    this.db.prepare(`UPDATE repair_log SET status = 'failed', completed_at = datetime('now') WHERE repair_id = ?`).run(repairId);
  }

  close(): void { this.db.close(); }
}
