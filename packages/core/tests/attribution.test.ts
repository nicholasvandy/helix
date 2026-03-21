import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';

describe('Failure Attribution (OPT-10)', () => {
  let gm: GeneMap;
  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('records attribution for repair', () => {
    gm.recordAttribution({ repairId: 'r1', agentId: 'bot-1', stepId: 'transfer', failureCode: 'verification-failed', category: 'signature', strategy: 'refresh_nonce', success: true });
    const stats = gm.getAgentStats('bot-1');
    expect(stats.totalFailures).toBe(1);
    expect(stats.topCategories[0].category).toBe('signature');
  });

  it('tracks multiple agents', () => {
    gm.recordAttribution({ repairId: 'r1', agentId: 'bot-1', failureCode: 'a', category: 'balance', success: true });
    gm.recordAttribution({ repairId: 'r2', agentId: 'bot-2', failureCode: 'b', category: 'auth', success: false });
    const global = gm.getGlobalAttributionStats();
    expect(global.totalRepairs).toBe(2);
    expect(global.topAgents.length).toBe(2);
  });

  it('calculates success rate', () => {
    gm.recordAttribution({ repairId: 'r1', agentId: 'bot', failureCode: 'a', category: 'a', success: true });
    gm.recordAttribution({ repairId: 'r2', agentId: 'bot', failureCode: 'b', category: 'b', success: true });
    gm.recordAttribution({ repairId: 'r3', agentId: 'bot', failureCode: 'c', category: 'c', success: true });
    gm.recordAttribution({ repairId: 'r4', agentId: 'bot', failureCode: 'd', category: 'd', success: false });
    const stats = gm.getAgentStats('bot');
    expect(stats.successRate).toBe(0.75);
  });

  it('tracks step-level attribution', () => {
    gm.recordAttribution({ repairId: 'r1', agentId: 'bot', stepId: 'payment', failureCode: 'a', category: 'balance', success: false });
    gm.recordAttribution({ repairId: 'r2', agentId: 'bot', stepId: 'payment', failureCode: 'b', category: 'balance', success: false });
    gm.recordAttribution({ repairId: 'r3', agentId: 'bot', stepId: 'signing', failureCode: 'c', category: 'signature', success: false });
    const stats = gm.getAgentStats('bot');
    expect(stats.topSteps[0].stepId).toBe('payment');
    expect(stats.topSteps[0].count).toBe(2);
  });
});
