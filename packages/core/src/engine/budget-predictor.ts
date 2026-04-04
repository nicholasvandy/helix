import type Database from 'better-sqlite3';

export interface BudgetEstimate {
  taskType: string;
  avg: number;
  min: number;
  max: number;
  median: number;
  p95: number;
  confidence: number;
  samples: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgDurationMs: number;
  model: string | null;
}

export interface BudgetSummary {
  totalCapsules: number;
  totalCostUSD: number;
  taskTypes: Array<{ taskType: string; count: number; avgCost: number; totalCost: number }>;
}

export class BudgetPredictor {
  private db: Database.Database;

  constructor(geneMapOrDb: any) {
    this.db = geneMapOrDb.db ?? geneMapOrDb.database ?? geneMapOrDb;
    if (!this.db?.prepare) throw new Error('BudgetPredictor requires a GeneMap or better-sqlite3 database');
  }

  estimate(taskType: string): BudgetEstimate {
    const rows = this.db.prepare(`
      SELECT token_cost_usd, input_tokens, output_tokens, duration_ms, model
      FROM capsules WHERE task_type = ? AND token_cost_usd IS NOT NULL AND token_cost_usd > 0
      ORDER BY token_cost_usd ASC
    `).all(taskType) as any[];

    if (rows.length === 0) {
      return { taskType, avg: 0, min: 0, max: 0, median: 0, p95: 0, confidence: 0, samples: 0, avgInputTokens: 0, avgOutputTokens: 0, avgDurationMs: 0, model: null };
    }

    const costs = rows.map(r => r.token_cost_usd);
    const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const sorted = [...costs].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const p95idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);

    const modelCounts = new Map<string, number>();
    for (const r of rows) if (r.model) modelCounts.set(r.model, (modelCounts.get(r.model) || 0) + 1);
    let topModel: string | null = null, topCount = 0;
    for (const [m, c] of modelCounts) if (c > topCount) { topModel = m; topCount = c; }

    return {
      taskType,
      avg: r6(mean(costs)), min: r6(Math.min(...costs)), max: r6(Math.max(...costs)),
      median: r6(median), p95: r6(sorted[p95idx]),
      confidence: Math.min(rows.length / 50, 1.0), samples: rows.length,
      avgInputTokens: Math.round(mean(rows.map(r => r.input_tokens || 0))),
      avgOutputTokens: Math.round(mean(rows.map(r => r.output_tokens || 0))),
      avgDurationMs: Math.round(mean(rows.map(r => r.duration_ms || 0))),
      model: topModel,
    };
  }

  estimateAll(): BudgetEstimate[] {
    const types = this.db.prepare(`SELECT DISTINCT task_type FROM capsules WHERE task_type IS NOT NULL AND token_cost_usd IS NOT NULL AND token_cost_usd > 0`).all() as any[];
    return types.map(t => this.estimate(t.task_type));
  }

  summary(): BudgetSummary {
    const total = this.db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(token_cost_usd), 0) as total_cost FROM capsules WHERE token_cost_usd IS NOT NULL AND token_cost_usd > 0`).get() as any;
    const byType = this.db.prepare(`SELECT task_type, COUNT(*) as count, ROUND(AVG(token_cost_usd), 6) as avg_cost, ROUND(SUM(token_cost_usd), 6) as total_cost FROM capsules WHERE task_type IS NOT NULL AND token_cost_usd IS NOT NULL AND token_cost_usd > 0 GROUP BY task_type ORDER BY count DESC`).all() as any[];
    return {
      totalCapsules: total.count, totalCostUSD: r6(total.total_cost),
      taskTypes: byType.map(r => ({ taskType: r.task_type, count: r.count, avgCost: r.avg_cost, totalCost: r.total_cost })),
    };
  }
}

function r6(n: number): number { return Math.round(n * 1_000_000) / 1_000_000; }
