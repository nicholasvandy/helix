import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine/wrap.js';
import type { WrapOptions } from '../src/engine/types.js';

describe('CLI', () => {
  it('status returns valid health data', () => {
    const engine = createEngine({ mode: 'observe', agentId: 'cli-test', geneMapPath: ':memory:' } as WrapOptions);
    const h = engine.getGeneMap().health();
    expect(h).toBeDefined();
    expect(h.totalGenes).toBeGreaterThanOrEqual(0);
    expect(typeof h.avgQValue).toBe('number');
    expect(Array.isArray(h.platforms)).toBe(true);
    engine.getGeneMap().close();
  });

  it('gc runs without error', () => {
    const engine = createEngine({ mode: 'observe', agentId: 'cli-test', geneMapPath: ':memory:' } as WrapOptions);
    const result = engine.getGeneMap().gc();
    expect(typeof result.merged).toBe('number');
    expect(typeof result.pruned).toBe('number');
    engine.getGeneMap().close();
  });
});
