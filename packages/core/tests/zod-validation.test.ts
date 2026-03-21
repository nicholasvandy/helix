import { describe, it, expect } from 'vitest';
import { validateStrategyParams } from '../src/engine/strategy-schemas.js';

describe('Strategy Param Validation (D17)', () => {
  it('validates refresh_nonce params', () => {
    const r = validateStrategyParams('refresh_nonce', { walletAddress: '0xabc123' });
    expect(r.valid).toBe(true);
  });

  it('rejects invalid wallet address', () => {
    const r = validateStrategyParams('refresh_nonce', { walletAddress: 'not-an-address' });
    expect(r.valid).toBe(false);
  });

  it('allows unknown strategy (no schema)', () => {
    const r = validateStrategyParams('unknown_strategy', { anything: true });
    expect(r.valid).toBe(true);
  });

  it('validates swap params', () => {
    const r = validateStrategyParams('swap_currency', { maxSlippage: 0.005 });
    expect(r.valid).toBe(true);
  });

  it('rejects excessive slippage', () => {
    const r = validateStrategyParams('swap_currency', { maxSlippage: 0.9 });
    expect(r.valid).toBe(false);
  });

  it('validates backoff_retry delay', () => {
    const r = validateStrategyParams('backoff_retry', { defaultDelayMs: 2000 });
    expect(r.valid).toBe(true);
  });

  it('rejects negative delay', () => {
    const r = validateStrategyParams('backoff_retry', { defaultDelayMs: -1 });
    expect(r.valid).toBe(false);
  });
});
