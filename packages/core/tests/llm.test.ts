import { describe, it, expect, vi, afterEach } from 'vitest';
import { llmClassify } from '../src/engine/llm.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('LLM Fallback', () => {
  it('returns null when disabled', async () => {
    const r = await llmClassify('some error', { provider: 'anthropic', enabled: false });
    expect(r).toBeNull();
  });

  it('returns null when no API key', async () => {
    const old = process.env.HELIX_LLM_API_KEY;
    delete process.env.HELIX_LLM_API_KEY;
    const r = await llmClassify('some error', { provider: 'anthropic', enabled: true });
    expect(r).toBeNull();
    if (old) process.env.HELIX_LLM_API_KEY = old;
  });

  it('returns null on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network error'))));
    const r = await llmClassify('error', { provider: 'anthropic', enabled: true, apiKey: 'fake', timeoutMs: 100 });
    expect(r).toBeNull();
  });

  it('parses valid Anthropic response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"code":"verification-failed","category":"signature","severity":"high","reasoning":"nonce error"}' }] }),
    })));
    const r = await llmClassify('Nonce provided for the transaction is lower', { provider: 'anthropic', enabled: true, apiKey: 'fake' });
    expect(r).not.toBeNull();
    expect(r!.code).toBe('verification-failed');
    expect(r!.category).toBe('signature');
    expect(r!.llmClassified).toBe(true);
  });

  it('parses valid OpenAI response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '{"code":"rate-limited","category":"auth","severity":"medium","reasoning":"429"}' } }] }),
    })));
    const r = await llmClassify('too many requests', { provider: 'openai', enabled: true, apiKey: 'fake' });
    expect(r).not.toBeNull();
    expect(r!.code).toBe('rate-limited');
  });

  it('normalizes invalid codes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"code":"invented","category":"fake","severity":"extreme","reasoning":"test"}' }] }),
    })));
    const r = await llmClassify('error', { provider: 'anthropic', enabled: true, apiKey: 'fake' });
    expect(r!.code).toBe('unknown');
    expect(r!.category).toBe('unknown');
    expect(r!.severity).toBe('medium');
  });

  it('handles API error gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('error') })));
    const r = await llmClassify('error', { provider: 'anthropic', enabled: true, apiKey: 'fake' });
    expect(r).toBeNull();
  });
});
