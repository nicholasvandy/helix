import { describe, it, expect, beforeEach } from 'vitest';
import {
  tokenize,
  tokenSimilarity,
  matchErrorSignature,
  addSignature,
  getSignatures,
} from '../src/engine/error-embedding.js';
import type { ErrorSignature } from '../src/engine/error-embedding.js';

// ── tokenize ──────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    const result = tokenize('Gas Too Low');
    expect(result).toContain('gas');
    expect(result).toContain('too');
    expect(result).toContain('low');
  });

  it('strips special characters', () => {
    const result = tokenize('nonce-mismatch!');
    expect(result).toContain('nonce');
    expect(result).toContain('mismatch');
  });

  it('removes stop words', () => {
    const result = tokenize('the error was invalid and failed');
    // all tokens here are stop words or <3 chars
    expect(result).not.toContain('the');
    expect(result).not.toContain('and');
    expect(result).not.toContain('error');
    expect(result).not.toContain('invalid');
    expect(result).not.toContain('failed');
    expect(result).not.toContain('was');
  });

  it('removes tokens shorter than 3 characters', () => {
    const result = tokenize('gas is ok go');
    expect(result).toContain('gas');
    expect(result).not.toContain('is');
    expect(result).not.toContain('ok');
    expect(result).not.toContain('go');
  });

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

// ── tokenSimilarity ───────────────────────────────────────────────────────────

describe('tokenSimilarity', () => {
  it('perfect match returns 1.0', () => {
    const sig: ErrorSignature = {
      tokens: ['nonce', 'mismatch'],
      failureCode: 'verification-failed',
      failureCategory: 'signature',
    };
    const score = tokenSimilarity(['nonce', 'mismatch'], sig);
    expect(score).toBe(1.0);
  });

  it('partial match returns fraction', () => {
    const sig: ErrorSignature = {
      tokens: ['nonce', 'mismatch'],
      failureCode: 'verification-failed',
      failureCategory: 'signature',
    };
    const score = tokenSimilarity(['nonce'], sig);
    expect(score).toBe(0.5);
  });

  it('no match returns 0', () => {
    const sig: ErrorSignature = {
      tokens: ['nonce', 'mismatch'],
      failureCode: 'verification-failed',
      failureCategory: 'signature',
    };
    const score = tokenSimilarity(['timeout', 'exceeded'], sig);
    expect(score).toBe(0);
  });

  it('respects weights', () => {
    // weights [3, 2] — total 5. Only first matched → 3/5 = 0.6
    const sig: ErrorSignature = {
      tokens: ['aa25', 'nonce'],
      weights: [3, 2],
      failureCode: 'verification-failed',
      failureCategory: 'signature',
    };
    const score = tokenSimilarity(['aa25'], sig);
    expect(score).toBeCloseTo(3 / 5);
  });

  it('returns 0 for empty signature tokens', () => {
    const sig: ErrorSignature = {
      tokens: [],
      failureCode: 'unknown',
      failureCategory: 'unknown',
    };
    const score = tokenSimilarity(['nonce'], sig);
    expect(score).toBe(0);
  });
});

// ── matchErrorSignature ───────────────────────────────────────────────────────

describe('matchErrorSignature', () => {
  it('matches nonce mismatch', () => {
    const match = matchErrorSignature('nonce mismatch detected');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('nonce-mismatch');
    expect(match!.failureCategory).toBe('nonce');
    expect(match!.similarity).toBeGreaterThanOrEqual(0.5);
  });

  it('matches AA25 nonce error', () => {
    const match = matchErrorSignature('AA25 nonce too low');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('nonce-mismatch');
  });

  it('matches insufficient balance', () => {
    const match = matchErrorSignature('insufficient balance to cover transfer');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('payment-insufficient');
    expect(match!.failureCategory).toBe('balance');
  });

  it('matches rate limit 429', () => {
    const match = matchErrorSignature('429 too many requests from client');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('rate-limited');
    expect(match!.failureCategory).toBe('auth');
  });

  it('matches execution reverted', () => {
    const match = matchErrorSignature('execution reverted: transfer amount exceeds allowance');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('execution-reverted');
    expect(match!.failureCategory).toBe('contract');
  });

  it('matches timeout', () => {
    const match = matchErrorSignature('request timeout exceeded');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('timeout');
    expect(match!.failureCategory).toBe('service');
  });

  it('matches gas underpriced', () => {
    const match = matchErrorSignature('transaction underpriced');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('gas-estimation-failed');
    expect(match!.failureCategory).toBe('gas');
  });

  it('matches x402 payment required', () => {
    const match = matchErrorSignature('402 payment required');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('x402-payment-failed');
    expect(match!.failureCategory).toBe('balance');
  });

  it('returns null for unrecognized error', () => {
    const match = matchErrorSignature('something completely unrelated xyz');
    expect(match).toBeNull();
  });

  it('returns null for empty message', () => {
    expect(matchErrorSignature('')).toBeNull();
  });
});

// ── addSignature ──────────────────────────────────────────────────────────────

describe('addSignature', () => {
  it('adds a custom signature that can be matched', () => {
    const customSig: ErrorSignature = {
      tokens: ['zork', 'blorp'],
      failureCode: 'custom-error',
      failureCategory: 'unknown',
    };
    addSignature(customSig);

    const sigs = getSignatures();
    expect(sigs.some(s => s.failureCode === 'custom-error')).toBe(true);

    const match = matchErrorSignature('zork blorp happened');
    expect(match).not.toBeNull();
    expect(match!.failureCode).toBe('custom-error');
  });
});
