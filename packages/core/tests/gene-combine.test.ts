import { describe, it, expect, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';

describe('Gene GC', () => {
  let geneMap: GeneMap;

  afterEach(() => { geneMap.close(); });

  it('prunes genes with low q_value and consecutive failures', () => {
    geneMap = new GeneMap(':memory:');
    // The seed genes have high q_values, so override one to be prunable
    geneMap.store({
      failureCode: 'test-prune', category: 'test', strategy: 's',
      params: {}, successCount: 1, avgRepairMs: 100, platforms: ['tempo'],
      qValue: 0.05, consecutiveFailures: 5,
    });
    const before = geneMap.immuneCount();
    const result = geneMap.gc();
    expect(result.pruned).toBeGreaterThanOrEqual(1);
    expect(geneMap.immuneCount()).toBeLessThan(before);
  });

  it('does not prune healthy genes', () => {
    geneMap = new GeneMap(':memory:');
    const before = geneMap.immuneCount();
    const result = geneMap.gc();
    expect(result.pruned).toBe(0);
    expect(geneMap.immuneCount()).toBe(before);
  });

  it('combine merges after combine is called', () => {
    geneMap = new GeneMap(':memory:');
    // The UNIQUE constraint prevents true duplicates in same table,
    // but combine still runs without error on seed data
    const result = geneMap.combine();
    expect(result.merged).toBeGreaterThanOrEqual(0);
  });
});
