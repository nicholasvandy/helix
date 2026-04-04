import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';
import { BudgetPredictor } from '../src/engine/budget-predictor.js';

describe('BudgetPredictor', () => {
  let geneMap: GeneMap;
  let predictor: BudgetPredictor;

  function insert(taskType: string, costUsd: number, inputTokens: number, outputTokens: number, model = 'claude-sonnet-4-6') {
    const db = (geneMap as any).db;
    db.prepare(`INSERT INTO capsules (id, session_id, tool_name, input, output, success, duration_ms, created_at, task_type, token_cost_usd, input_tokens, output_tokens, model, num_api_calls) VALUES (?, ?, 'test', '{}', '{}', 1, 1000, datetime('now'), ?, ?, ?, ?, ?, 1)`).run(
      `t-${Date.now()}-${Math.random().toString(36).slice(2)}`, `s-${Date.now()}`,
      taskType, costUsd, inputTokens, outputTokens, model,
    );
  }

  beforeEach(() => { geneMap = new GeneMap(); predictor = new BudgetPredictor(geneMap); });
  afterEach(() => { geneMap.close(); });

  it('returns zero for unknown task type', () => {
    const e = predictor.estimate('unknown');
    expect(e.samples).toBe(0);
    expect(e.confidence).toBe(0);
    expect(e.avg).toBe(0);
  });

  it('estimates from single capsule', () => {
    insert('write_code', 0.05, 10000, 2000);
    const e = predictor.estimate('write_code');
    expect(e.samples).toBe(1);
    expect(e.avg).toBe(0.05);
    expect(e.confidence).toBeCloseTo(0.02, 2);
  });

  it('calculates stats from multiple capsules', () => {
    insert('debug', 0.02, 5000, 1000);
    insert('debug', 0.04, 8000, 1500);
    insert('debug', 0.06, 12000, 2000);
    insert('debug', 0.08, 15000, 3000);
    insert('debug', 0.10, 20000, 4000);
    const e = predictor.estimate('debug');
    expect(e.samples).toBe(5);
    expect(e.avg).toBeCloseTo(0.06, 4);
    expect(e.min).toBe(0.02);
    expect(e.max).toBe(0.10);
    expect(e.median).toBe(0.06);
    expect(e.avgInputTokens).toBe(12000);
    expect(e.avgOutputTokens).toBe(2300);
  });

  it('confidence reaches 1.0 at 50 samples', () => {
    for (let i = 0; i < 50; i++) insert('write_test', 0.01 + i * 0.001, 1000, 500);
    expect(predictor.estimate('write_test').confidence).toBe(1.0);
  });

  it('tracks most common model', () => {
    insert('deploy', 0.05, 5000, 1000, 'claude-sonnet-4-6');
    insert('deploy', 0.06, 6000, 1200, 'claude-sonnet-4-6');
    insert('deploy', 0.08, 8000, 2000, 'claude-opus-4-6');
    expect(predictor.estimate('deploy').model).toBe('claude-sonnet-4-6');
  });

  it('estimateAll returns all task types', () => {
    insert('write_code', 0.05, 10000, 2000);
    insert('debug', 0.03, 5000, 1000);
    insert('write_docs', 0.02, 3000, 800);
    const all = predictor.estimateAll();
    expect(all.length).toBe(3);
    expect(all.map(e => e.taskType).sort()).toEqual(['debug', 'write_code', 'write_docs']);
  });

  it('summary returns correct totals', () => {
    insert('write_code', 0.05, 10000, 2000);
    insert('write_code', 0.08, 15000, 3000);
    insert('debug', 0.03, 5000, 1000);
    const s = predictor.summary();
    expect(s.totalCapsules).toBe(3);
    expect(s.totalCostUSD).toBeCloseTo(0.16, 4);
    expect(s.taskTypes.length).toBe(2);
  });

  it('ignores null and zero cost capsules', () => {
    insert('analysis', 0.05, 10000, 2000);
    insert('analysis', 0, 0, 0);
    const db = (geneMap as any).db;
    db.prepare(`INSERT INTO capsules (id, session_id, tool_name, input, output, success, duration_ms, task_type, token_cost_usd) VALUES ('n', 's', 't', '{}', '{}', 1, 0, 'analysis', NULL)`).run();
    expect(predictor.estimate('analysis').samples).toBe(1);
  });

  it('calculates p95 correctly', () => {
    for (let i = 1; i <= 20; i++) insert('refactor', i * 0.01, i * 1000, i * 500);
    const e = predictor.estimate('refactor');
    expect(e.p95).toBeGreaterThanOrEqual(0.19);
    expect(e.samples).toBe(20);
  });
});
