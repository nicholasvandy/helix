import { describe, it, expect, vi, afterEach } from 'vitest';
import { llmConstructCandidates } from '../src/engine/llm.js';
import type { FailureClassification } from '../src/engine/types.js';

const fail: FailureClassification = { code: 'unknown', category: 'unknown', severity: 'medium', platform: 'generic', details: '', timestamp: 0 };

afterEach(() => { vi.restoreAllMocks(); });

describe('LLM Construct Generator', () => {
  it('returns null when disabled', async () => {
    expect(await llmConstructCandidates(fail, 'err', { enabled: false })).toBeNull();
  });

  it('returns null when no API key', async () => {
    const saved = { ...process.env };
    delete process.env.HELIX_LLM_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
    expect(await llmConstructCandidates(fail, 'err', { enabled: true })).toBeNull();
    Object.assign(process.env, saved);
  });

  it('parses valid response into candidates', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ text: '[{"strategy":"backoff_retry","confidence":0.6,"reasoning":"transient"}]' }] }) })) as any;
    const r = await llmConstructCandidates(fail, 'WEIRD_ERROR', { enabled: true, provider: 'anthropic', apiKey: 'fake' });
    expect(r).not.toBeNull();
    expect(r![0].strategy).toBe('backoff_retry');
    expect(r![0].successProbability).toBeLessThanOrEqual(0.7);
    expect(r![0].source).toBe('llm');
    globalThis.fetch = origFetch;
  });

  it('filters invalid strategy names', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ text: '[{"strategy":"invented","confidence":0.5},{"strategy":"retry","confidence":0.4}]' }] }) })) as any;
    const r = await llmConstructCandidates(fail, 'err', { enabled: true, provider: 'anthropic', apiKey: 'fake' });
    expect(r!.length).toBe(1);
    expect(r![0].strategy).toBe('retry');
    globalThis.fetch = origFetch;
  });

  it('caps confidence at 0.7', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ text: '[{"strategy":"retry","confidence":0.99}]' }] }) })) as any;
    const r = await llmConstructCandidates(fail, 'err', { enabled: true, provider: 'anthropic', apiKey: 'fake' });
    expect(r![0].successProbability).toBe(0.7);
    globalThis.fetch = origFetch;
  });

  it('handles fetch error gracefully', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network'))) as any;
    const r = await llmConstructCandidates(fail, 'err', { enabled: true, provider: 'anthropic', apiKey: 'fake', timeoutMs: 100 });
    expect(r).toBeNull();
    globalThis.fetch = origFetch;
  });
});
