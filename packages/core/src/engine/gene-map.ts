import Database from 'better-sqlite3';
import type { ErrorCode, FailureCategory, GeneCapsule, Platform } from './types.js';
import { SEED_GENES } from './seed-genes.js';

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
    reasoning: row.reasoning as string | undefined,
    failureAnalysis: row.failure_analysis ? JSON.parse(row.failure_analysis as string) : [],
    successContext: row.success_context ? JSON.parse(row.success_context as string) : {},
    failureContext: row.failure_context ? JSON.parse(row.failure_context as string) : {},
  };
}

export class GeneMap {
  private static readonly SCHEMA_VERSION = 3;
  private db: Database.Database;
  private stmtLookup!: Database.Statement;
  private stmtUpsert!: Database.Statement;
  private stmtList!: Database.Statement;
  private stmtCount!: Database.Statement;
  private stmtUpdatePlatforms!: Database.Statement;
  private cache: Map<string, Record<string, unknown>> = new Map();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureSchema();
    this.prepareStatements();
    this.seed();
    this.warmCache();
  }

  // ── Schema Versioning (D10) ──

  private ensureSchema(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL, migrated_at DATETIME DEFAULT (datetime('now')))`);
    const row = this.db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
    const current = row?.version ?? 0;
    if (current < GeneMap.SCHEMA_VERSION) this.migrate(current);
  }

  private migrate(from: number): void {
    const migrations: Record<number, () => void> = {
      0: () => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS genes (id INTEGER PRIMARY KEY AUTOINCREMENT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT NOT NULL, params TEXT DEFAULT '{}', success_count INTEGER DEFAULT 1, avg_repair_ms REAL DEFAULT 0, platforms TEXT DEFAULT '[]', q_value REAL DEFAULT 0.5, last_success_at INTEGER, last_failed_at INTEGER, consecutive_failures INTEGER DEFAULT 0, reasoning TEXT, failure_analysis TEXT DEFAULT '[]', success_context TEXT DEFAULT '{}', failure_context TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), last_used_at TEXT DEFAULT (datetime('now')), UNIQUE(failure_code, category))`);
        this.db.exec(`CREATE TABLE IF NOT EXISTS repair_log (id INTEGER PRIMARY KEY AUTOINCREMENT, repair_id TEXT UNIQUE NOT NULL, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT NOT NULL, status TEXT DEFAULT 'pending', tx_hash TEXT, created_at DATETIME DEFAULT (datetime('now')), completed_at DATETIME)`);
        this.db.exec(`CREATE TABLE IF NOT EXISTS repair_attribution (id INTEGER PRIMARY KEY AUTOINCREMENT, repair_id TEXT NOT NULL, agent_id TEXT NOT NULL, step_id TEXT, workflow TEXT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT, success INTEGER DEFAULT 0, created_at DATETIME DEFAULT (datetime('now')))`);
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_attribution_agent ON repair_attribution(agent_id)');
      },
      1: () => {
        const addCol = (t: string, c: string, type: string, def: string) => { try { this.db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type} DEFAULT ${def}`); } catch { /* exists */ } };
        addCol('genes', 'reasoning', 'TEXT', 'NULL');
        addCol('genes', 'failure_analysis', 'TEXT', "'[]'");
        addCol('genes', 'success_context', 'TEXT', "'{}'");
        addCol('genes', 'failure_context', 'TEXT', "'{}'");
        this.db.exec(`CREATE TABLE IF NOT EXISTS repair_attribution (id INTEGER PRIMARY KEY AUTOINCREMENT, repair_id TEXT NOT NULL, agent_id TEXT NOT NULL, step_id TEXT, workflow TEXT, failure_code TEXT NOT NULL, category TEXT NOT NULL, strategy TEXT, success INTEGER DEFAULT 0, created_at DATETIME DEFAULT (datetime('now')))`);
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_attribution_agent ON repair_attribution(agent_id)');
      },
      2: () => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS gene_links (id INTEGER PRIMARY KEY AUTOINCREMENT, gene_a_code TEXT NOT NULL, gene_a_category TEXT NOT NULL, gene_b_code TEXT NOT NULL, gene_b_category TEXT NOT NULL, strength REAL DEFAULT 0.5, co_occurrence_count INTEGER DEFAULT 1, created_at DATETIME DEFAULT (datetime('now')), last_seen_at DATETIME DEFAULT (datetime('now')), UNIQUE(gene_a_code, gene_a_category, gene_b_code, gene_b_category))`);
      },
    };
    this.db.transaction(() => {
      for (let v = from; v < GeneMap.SCHEMA_VERSION; v++) {
        migrations[v]?.();
        this.db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v + 1);
      }
    })();
  }

  private prepareStatements(): void {
    this.stmtLookup = this.db.prepare(`SELECT * FROM genes WHERE failure_code = ? AND category = ? ORDER BY q_value DESC LIMIT 1`);
    this.stmtUpsert = this.db.prepare(`INSERT INTO genes (failure_code, category, strategy, params, success_count, avg_repair_ms, platforms, q_value, consecutive_failures) VALUES (@failureCode, @category, @strategy, @params, @successCount, @avgRepairMs, @platforms, @qValue, @consecutiveFailures) ON CONFLICT(failure_code, category) DO UPDATE SET strategy = @strategy, params = @params, success_count = success_count + 1, avg_repair_ms = (avg_repair_ms * success_count + @avgRepairMs) / (success_count + 1), platforms = @platforms, q_value = @qValue, consecutive_failures = @consecutiveFailures, last_used_at = datetime('now')`);
    this.stmtList = this.db.prepare(`SELECT * FROM genes ORDER BY q_value DESC, success_count DESC`);
    this.stmtCount = this.db.prepare(`SELECT COUNT(*) as count FROM genes`);
    this.stmtUpdatePlatforms = this.db.prepare(`UPDATE genes SET platforms = ?, last_used_at = datetime('now') WHERE failure_code = ? AND category = ?`);
  }

  // ── L1 Cache ──

  private cacheKey(code: string, category: string): string { return `${code}:${category}`; }
  private warmCache(): void { this.cache.clear(); for (const r of this.db.prepare('SELECT * FROM genes').all() as Record<string, unknown>[]) this.cache.set(this.cacheKey(r.failure_code as string, r.category as string), r); this.cacheLoadedAt = Date.now(); }
  private isCacheStale(): boolean { return Date.now() - this.cacheLoadedAt > this.CACHE_TTL_MS; }

  // ── Core CRUD ──

  lookup(code: ErrorCode, category: FailureCategory): GeneCapsule | null {
    const key = this.cacheKey(code, category);
    if (!this.isCacheStale() && this.cache.has(key)) {
      const cached = this.cache.get(key)!;
      this.db.prepare(`UPDATE genes SET last_used_at = datetime('now'), success_count = success_count + 1 WHERE failure_code = ? AND category = ?`).run(code, category);
      const gene = parseRow(cached); gene.successCount += 1; return gene;
    }
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return null;
    this.db.prepare(`UPDATE genes SET last_used_at = datetime('now'), success_count = success_count + 1 WHERE failure_code = ? AND category = ?`).run(code, category);
    this.cache.set(key, row);
    const gene = parseRow(row); gene.successCount += 1; return gene;
  }

  addPlatform(code: ErrorCode, category: FailureCategory, platform: Platform): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    const p: Platform[] = JSON.parse(row.platforms as string);
    if (!p.includes(platform)) { p.push(platform); this.stmtUpdatePlatforms.run(JSON.stringify(p), code, category); this.cache.delete(this.cacheKey(code, category)); }
  }

  store(gene: GeneCapsule): void {
    this.stmtUpsert.run({ failureCode: gene.failureCode, category: gene.category, strategy: gene.strategy, params: JSON.stringify(gene.params, (_k, v) => typeof v === 'bigint' ? v.toString() : v), successCount: gene.successCount, avgRepairMs: gene.avgRepairMs, platforms: JSON.stringify(gene.platforms), qValue: gene.qValue ?? 0.5, consecutiveFailures: gene.consecutiveFailures ?? 0 });
    this.cache.delete(this.cacheKey(gene.failureCode, gene.category));
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
  getSuccessRate(failureCode: string, strategy: string): number { const r = this.db.prepare(`SELECT success_count FROM genes WHERE failure_code = ? AND strategy = ?`).get(failureCode, strategy) as { success_count: number } | undefined; if (!r || r.success_count < 3) return 0.5; return Math.min(0.5 + (r.success_count / 100), 0.95); }

  stats() { const rows = this.stmtList.all() as Record<string, unknown>[]; const allP = new Set<string>(); let qSum = 0; for (const r of rows) { qSum += r.q_value as number; for (const p of JSON.parse(r.platforms as string)) allP.add(p); } return { totalGenes: rows.length, avgQValue: rows.length > 0 ? Math.round((qSum / rows.length) * 100) / 100 : 0, platforms: [...allP], topStrategies: rows.slice(0, 10).map(r => ({ strategy: r.strategy as string, count: r.success_count as number })) }; }

  // ── Seed (D9) ──

  seed(): { seeded: number } {
    const cnt = (this.db.prepare('SELECT COUNT(*) as cnt FROM genes').get() as { cnt: number }).cnt;
    if (cnt > 0) return { seeded: 0 };
    let seeded = 0;
    const ins = this.db.prepare(`INSERT OR IGNORE INTO genes (failure_code, category, strategy, params, success_count, avg_repair_ms, platforms, q_value, consecutive_failures) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    this.db.transaction(() => { for (const g of SEED_GENES) { ins.run(g.failureCode, g.category, g.strategy, JSON.stringify(g.params), g.successCount, g.avgRepairMs, JSON.stringify(g.platforms), g.qValue, g.consecutiveFailures); seeded++; } })();
    return { seeded };
  }

  // ── Gene Combine (OPT-3) ──

  combine(): { merged: number } {
    let merged = 0;
    const groups = this.db.prepare(`SELECT failure_code, category, COUNT(*) as cnt FROM genes GROUP BY failure_code, category HAVING cnt > 1`).all() as { failure_code: string; category: string }[];
    for (const g of groups) {
      const genes = this.db.prepare(`SELECT * FROM genes WHERE failure_code = ? AND category = ? ORDER BY q_value DESC`).all(g.failure_code, g.category) as Record<string, unknown>[];
      if (genes.length <= 1) continue;
      const best = genes[0]; const allP = new Set<string>(); let totalSC = 0; let wMs = 0;
      for (const gn of genes) { totalSC += gn.success_count as number; wMs += (gn.avg_repair_ms as number) * (gn.success_count as number); for (const p of JSON.parse(gn.platforms as string)) allP.add(p); }
      const maxQ = Math.max(...genes.map(gn => gn.q_value as number));
      this.db.prepare(`UPDATE genes SET platforms = ?, success_count = ?, avg_repair_ms = ?, q_value = ?, last_used_at = datetime('now') WHERE id = ?`).run(JSON.stringify([...allP]), totalSC, wMs / Math.max(totalSC, 1), maxQ, best.id);
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

  // ── Reasoning (OPT-4) ──

  recordFailureAnalysis(code: string, category: string, analysis: string): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    const existing: string[] = row.failure_analysis ? JSON.parse(row.failure_analysis as string) : [];
    const updated = [...existing, `[${new Date().toISOString().slice(0, 10)}] ${analysis}`].slice(-5);
    this.db.prepare(`UPDATE genes SET failure_analysis = ? WHERE failure_code = ? AND category = ?`).run(JSON.stringify(updated), code, category);
    this.cache.delete(this.cacheKey(code, category));
  }

  updateContext(code: string, category: string, success: boolean, context: { chain?: string; walletType?: string; platform?: string }): void {
    const row = this.stmtLookup.get(code, category) as Record<string, unknown> | undefined;
    if (!row) return;
    if (success) {
      const ctx = row.success_context ? JSON.parse(row.success_context as string) : {};
      if (context.chain && !(ctx.chains ?? []).includes(context.chain)) ctx.chains = [...(ctx.chains ?? []), context.chain];
      if (context.platform && !(ctx.platforms ?? []).includes(context.platform)) ctx.platforms = [...(ctx.platforms ?? []), context.platform];
      this.db.prepare('UPDATE genes SET success_context = ? WHERE failure_code = ? AND category = ?').run(JSON.stringify(ctx), code, category);
    } else {
      const ctx = row.failure_context ? JSON.parse(row.failure_context as string) : {};
      if (context.chain && !(ctx.chains ?? []).includes(context.chain)) ctx.chains = [...(ctx.chains ?? []), context.chain];
      this.db.prepare('UPDATE genes SET failure_context = ? WHERE failure_code = ? AND category = ?').run(JSON.stringify(ctx), code, category);
    }
    this.cache.delete(this.cacheKey(code, category));
  }

  // ── Idempotency (D5) ──

  generateRepairId(): string { return `repair_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  checkRepairInProgress(code: string, category: string): { inProgress: boolean; repairId?: string; txHash?: string } {
    const r = this.db.prepare(`SELECT repair_id, status, tx_hash FROM repair_log WHERE failure_code = ? AND category = ? AND status IN ('pending','completed') AND created_at > datetime('now','-5 minutes') ORDER BY created_at DESC LIMIT 1`).get(code, category) as { repair_id: string; status: string; tx_hash: string } | undefined;
    if (!r) return { inProgress: false };
    if (r.status === 'pending') return { inProgress: true, repairId: r.repair_id };
    if (r.status === 'completed' && r.tx_hash) return { inProgress: true, repairId: r.repair_id, txHash: r.tx_hash };
    return { inProgress: false };
  }

  logRepairStart(id: string, code: string, category: string, strategy: string): void { this.db.prepare(`INSERT OR IGNORE INTO repair_log (repair_id, failure_code, category, strategy, status) VALUES (?,?,?,?,'pending')`).run(id, code, category, strategy); }
  logRepairComplete(id: string, txHash?: string): void { this.db.prepare(`UPDATE repair_log SET status='completed', tx_hash=?, completed_at=datetime('now') WHERE repair_id=?`).run(txHash ?? null, id); }
  logRepairFailed(id: string): void { this.db.prepare(`UPDATE repair_log SET status='failed', completed_at=datetime('now') WHERE repair_id=?`).run(id); }

  // ── Attribution (OPT-10) ──

  recordAttribution(data: { repairId: string; agentId: string; stepId?: string; workflow?: string; failureCode: string; category: string; strategy?: string; success: boolean }): void {
    this.db.prepare(`INSERT INTO repair_attribution (repair_id, agent_id, step_id, workflow, failure_code, category, strategy, success) VALUES (?,?,?,?,?,?,?,?)`).run(data.repairId, data.agentId, data.stepId ?? null, data.workflow ?? null, data.failureCode, data.category, data.strategy ?? null, data.success ? 1 : 0);
  }

  getAgentStats(agentId: string) {
    const total = (this.db.prepare('SELECT COUNT(*) as cnt FROM repair_attribution WHERE agent_id = ?').get(agentId) as { cnt: number }).cnt;
    const cats = this.db.prepare(`SELECT category, COUNT(*) as cnt FROM repair_attribution WHERE agent_id = ? GROUP BY category ORDER BY cnt DESC LIMIT 5`).all(agentId) as { category: string; cnt: number }[];
    const steps = this.db.prepare(`SELECT step_id, COUNT(*) as cnt FROM repair_attribution WHERE agent_id = ? AND step_id IS NOT NULL GROUP BY step_id ORDER BY cnt DESC LIMIT 5`).all(agentId) as { step_id: string; cnt: number }[];
    const ok = (this.db.prepare('SELECT COUNT(*) as cnt FROM repair_attribution WHERE agent_id = ? AND success = 1').get(agentId) as { cnt: number }).cnt;
    return { totalFailures: total, topCategories: cats.map(c => ({ category: c.category, count: c.cnt })), topSteps: steps.map(s => ({ stepId: s.step_id, count: s.cnt })), successRate: total > 0 ? ok / total : 0 };
  }

  getGlobalAttributionStats() {
    const total = (this.db.prepare('SELECT COUNT(*) as cnt FROM repair_attribution').get() as { cnt: number }).cnt;
    const agents = this.db.prepare(`SELECT agent_id, COUNT(*) as cnt FROM repair_attribution GROUP BY agent_id ORDER BY cnt DESC LIMIT 10`).all() as { agent_id: string; cnt: number }[];
    const cats = this.db.prepare(`SELECT category, COUNT(*) as cnt FROM repair_attribution GROUP BY category ORDER BY cnt DESC LIMIT 10`).all() as { category: string; cnt: number }[];
    const ok = (this.db.prepare('SELECT COUNT(*) as cnt FROM repair_attribution WHERE success = 1').get() as { cnt: number }).cnt;
    return { totalRepairs: total, topAgents: agents.map(a => ({ agentId: a.agent_id, failures: a.cnt })), topCategories: cats.map(c => ({ category: c.category, count: c.cnt })), overallSuccessRate: total > 0 ? ok / total : 0 };
  }

  // ── Gene Links (OPT-5: A-Mem paper) ──

  recordCoOccurrence(codeA: string, catA: string, codeB: string, catB: string): void {
    const [a, b] = [{ code: codeA, cat: catA }, { code: codeB, cat: catB }].sort((x, y) => `${x.code}:${x.cat}`.localeCompare(`${y.code}:${y.cat}`));
    this.db.prepare(`INSERT INTO gene_links (gene_a_code, gene_a_category, gene_b_code, gene_b_category) VALUES (?,?,?,?) ON CONFLICT(gene_a_code, gene_a_category, gene_b_code, gene_b_category) DO UPDATE SET co_occurrence_count = co_occurrence_count + 1, strength = MIN(1.0, strength + 0.1), last_seen_at = datetime('now')`).run(a.code, a.cat, b.code, b.cat);
  }

  getRelatedFailures(code: string, category: string): { code: string; category: string; strength: number; coOccurrences: number }[] {
    return (this.db.prepare(`SELECT CASE WHEN gene_a_code = ? AND gene_a_category = ? THEN gene_b_code ELSE gene_a_code END as rc, CASE WHEN gene_a_code = ? AND gene_a_category = ? THEN gene_b_category ELSE gene_a_category END as rcat, strength, co_occurrence_count as co FROM gene_links WHERE (gene_a_code = ? AND gene_a_category = ?) OR (gene_b_code = ? AND gene_b_category = ?) ORDER BY strength DESC LIMIT 5`).all(code, category, code, category, code, category, code, category) as any[]).map(r => ({ code: r.rc, category: r.rcat, strength: r.strength, coOccurrences: r.co }));
  }

  // ── Health (for CLI) ──

  health(): { totalGenes: number; avgQValue: number; platforms: string[]; topStrategies: { strategy: string; qValue: number; count: number }[] } {
    const rows = this.stmtList.all() as Record<string, unknown>[];
    const allP = new Set<string>();
    let qSum = 0;
    for (const r of rows) { qSum += r.q_value as number; for (const p of JSON.parse(r.platforms as string)) allP.add(p); }
    return {
      totalGenes: rows.length,
      avgQValue: rows.length > 0 ? qSum / rows.length : 0,
      platforms: [...allP],
      topStrategies: rows.slice(0, 10).map(r => ({ strategy: r.strategy as string, qValue: r.q_value as number, count: r.success_count as number })),
    };
  }

  close(): void { this.db.close(); }
}
