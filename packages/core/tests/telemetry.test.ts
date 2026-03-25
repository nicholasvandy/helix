import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportDiscovery } from '../src/engine/telemetry.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('Gene Telemetry', () => {
  it('does not send when disabled', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    reportDiscovery({ errorMessage: 'test', code: 'unknown', category: 'unknown', severity: 'medium', strategy: 'retry', qValue: 0.5, source: 'llm', platform: 'generic' }, { enabled: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not send when HELIX_TELEMETRY=false', () => {
    const old = process.env.HELIX_TELEMETRY;
    process.env.HELIX_TELEMETRY = 'false';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    reportDiscovery({ errorMessage: 'test', code: 'unknown', category: 'unknown', severity: 'medium', strategy: 'retry', qValue: 0.5, source: 'llm', platform: 'generic' }, { enabled: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    if (old !== undefined) process.env.HELIX_TELEMETRY = old; else delete process.env.HELIX_TELEMETRY;
  });

  it('sanitizes addresses and keys from error messages', () => {
    let captured: any = null;
    reportDiscovery(
      { errorMessage: 'transfer from 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18 failed with key 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', code: 'test', category: 'test', severity: 'medium', strategy: 'retry', qValue: 0.5, source: 'llm', platform: 'generic' },
      { enabled: true, onTelemetry: (e) => { captured = e; return false; /* block sending */ } },
    );
    expect(captured).not.toBeNull();
    expect(captured.errorPattern).not.toContain('742d35');
    expect(captured.errorPattern).toContain('[ADDR]');
    expect(captured.errorPattern).toContain('[REDACTED_64]');
  });

  it('respects onTelemetry callback returning false', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    reportDiscovery(
      { errorMessage: 'test', code: 'test', category: 'test', severity: 'medium', strategy: 'retry', qValue: 0.5, source: 'llm', platform: 'generic' },
      { enabled: true, onTelemetry: () => false },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
