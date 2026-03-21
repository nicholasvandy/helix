import { describe, it, expect } from 'vitest';
import { getRootCause } from '../src/engine/root-causes.js';

describe('Root Cause Hints (OPT-7)', () => {
  it('returns root cause for nonce mismatch', () => {
    const rc = getRootCause('verification-failed', 'signature');
    expect(rc).not.toBeNull();
    expect(rc!.hint).toBe('concurrent_wallet_access');
    expect(rc!.isLikelySystematic).toBe(true);
  });

  it('returns root cause for rate limiting', () => {
    const rc = getRootCause('rate-limited', 'auth');
    expect(rc).not.toBeNull();
    expect(rc!.hint).toBe('api_quota_exceeded');
    expect(rc!.isLikelySystematic).toBe(false);
  });

  it('returns root cause for network mismatch', () => {
    const rc = getRootCause('token-uninitialized', 'network');
    expect(rc).not.toBeNull();
    expect(rc!.isLikelySystematic).toBe(true);
  });

  it('returns root cause for policy violation', () => {
    const rc = getRootCause('policy-violation', 'policy');
    expect(rc).not.toBeNull();
    expect(rc!.hint).toBe('spending_limit_config');
  });

  it('returns null for unknown combination', () => {
    expect(getRootCause('unknown', 'unknown')).toBeNull();
  });

  it('returns root cause for malformed credential', () => {
    const rc = getRootCause('malformed-credential', 'service');
    expect(rc).not.toBeNull();
    expect(rc!.hint).toBe('bad_tx_encoding');
  });
});
