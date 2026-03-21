import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';

describe('Idempotency (D5)', () => {
  let geneMap: GeneMap;

  beforeEach(() => { geneMap = new GeneMap(':memory:'); });
  afterEach(() => { geneMap.close(); });

  it('generates unique repair IDs', () => {
    const id1 = geneMap.generateRepairId();
    const id2 = geneMap.generateRepairId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^repair_\d+_[a-z0-9]+$/);
  });

  it('detects in-progress repair', () => {
    const repairId = geneMap.generateRepairId();
    geneMap.logRepairStart(repairId, 'test-code', 'test-cat', 'test-strategy');
    const check = geneMap.checkRepairInProgress('test-code', 'test-cat');
    expect(check.inProgress).toBe(true);
    expect(check.repairId).toBe(repairId);
  });

  it('detects completed repair with tx hash', () => {
    const repairId = geneMap.generateRepairId();
    geneMap.logRepairStart(repairId, 'test-code', 'test-cat', 'test-strategy');
    geneMap.logRepairComplete(repairId, '0xabc123');
    const check = geneMap.checkRepairInProgress('test-code', 'test-cat');
    expect(check.inProgress).toBe(true);
    expect(check.txHash).toBe('0xabc123');
  });

  it('does not flag failed repairs as in progress', () => {
    const repairId = geneMap.generateRepairId();
    geneMap.logRepairStart(repairId, 'test-code', 'test-cat', 'test-strategy');
    geneMap.logRepairFailed(repairId);
    const check = geneMap.checkRepairInProgress('test-code', 'test-cat');
    expect(check.inProgress).toBe(false);
  });

  it('does not cross-contaminate different error types', () => {
    const repairId = geneMap.generateRepairId();
    geneMap.logRepairStart(repairId, 'code-a', 'cat-a', 'strategy-a');
    const check = geneMap.checkRepairInProgress('code-b', 'cat-b');
    expect(check.inProgress).toBe(false);
  });
});
