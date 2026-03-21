import { describe, it, expect } from 'vitest';
import { simulate, simulateAsync } from '../src/testing.js';

describe('Simulate Testing Framework (D24)', () => {
  it('async simulate diagnoses nonce error', async () => {
    const result = await simulateAsync({ error: 'AA25 Invalid account nonce' });
    expect(result.mode).toBe('observe');
    expect(result.immune).toBe(true); // seed gene
  });

  it('async simulate with seed genes — immune', async () => {
    const result = await simulateAsync({ error: 'nonce mismatch' });
    expect(result.immune).toBe(true);
  });

  it('sync simulate returns recommendation for known error', () => {
    const result = simulate({ error: '429 Too Many Requests' });
    expect(result.recommended).not.toBeNull();
    expect(result.recommended!.strategy).toBeDefined();
    expect(result.immune).toBe(true); // seed gene
  });

  it('sync simulate returns null for unknown error', () => {
    const result = simulate({ error: 'completely random error message xyz' });
    expect(result.recommended).toBeNull();
    expect(result.immune).toBe(false);
  });

  it('sync simulate detects nonce via pattern', () => {
    const result = simulate({ error: 'nonce mismatch on wallet' });
    expect(result.immune).toBe(true);
    expect(result.recommended!.strategy).toBe('refresh_nonce');
  });
});
