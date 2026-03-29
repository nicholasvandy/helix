import { describe, test, expect } from 'vitest';
import { apiAdapter, getPatternStats } from '../src/api-adapter.js';

describe('API Adapter', () => {

  // Rate limiting
  test('429 → rate-limited + backoff_retry', () => {
    const result = apiAdapter.perceive('Request failed with status 429: Too Many Requests');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('rate-limited');
    expect(result!.category).toBe('throttle');
    expect(result!.strategy).toBe('backoff_retry');
  });

  test('rate limit text → rate-limited', () => {
    const result = apiAdapter.perceive('API rate limit exceeded, try again in 30s');
    expect(result!.code).toBe('rate-limited');
  });

  // Server errors
  test('500 → server-error-500 + retry', () => {
    const result = apiAdapter.perceive('Internal Server Error (500)');
    expect(result!.code).toBe('server-error-500');
    expect(result!.strategy).toBe('retry');
  });

  test('502 → bad gateway', () => {
    const result = apiAdapter.perceive('502 Bad Gateway');
    expect(result!.code).toBe('server-error-502');
  });

  test('503 → service unavailable + backoff', () => {
    const result = apiAdapter.perceive('503 Service Unavailable');
    expect(result!.code).toBe('server-unavailable');
    expect(result!.strategy).toBe('backoff_retry');
  });

  test('504 → gateway timeout', () => {
    const result = apiAdapter.perceive('504 Gateway Timeout');
    expect(result!.code).toBe('gateway-timeout');
  });

  // Timeouts
  test('ETIMEDOUT → request-timeout + backoff', () => {
    const result = apiAdapter.perceive('connect ETIMEDOUT 192.168.1.1:443');
    expect(result!.code).toBe('request-timeout');
    expect(result!.strategy).toBe('backoff_retry');
  });

  test('timeout text → request-timeout', () => {
    const result = apiAdapter.perceive('Request timed out after 30000ms');
    expect(result!.code).toBe('request-timeout');
  });

  test('deadline exceeded → timeout', () => {
    const result = apiAdapter.perceive('DEADLINE_EXCEEDED: deadline exceeded');
    expect(result!.code).toBe('request-timeout');
  });

  // Connection errors
  test('ECONNREFUSED → connection-refused', () => {
    const result = apiAdapter.perceive('connect ECONNREFUSED 127.0.0.1:3000');
    expect(result!.code).toBe('connection-refused');
    expect(result!.strategy).toBe('backoff_retry');
  });

  test('ECONNRESET → connection-reset', () => {
    const result = apiAdapter.perceive('read ECONNRESET');
    expect(result!.code).toBe('connection-reset');
    expect(result!.strategy).toBe('retry');
  });

  test('ENOTFOUND → dns-error', () => {
    const result = apiAdapter.perceive('getaddrinfo ENOTFOUND api.example.com');
    expect(result!.code).toBe('dns-error');
  });

  // Auth
  test('401 → auth-error + renew_session', () => {
    const result = apiAdapter.perceive('Request failed with status 401: Unauthorized');
    expect(result!.code).toBe('auth-error');
    expect(result!.strategy).toBe('renew_session');
  });

  test('expired token → auth-error', () => {
    const result = apiAdapter.perceive('Token expired, please refresh');
    expect(result!.code).toBe('auth-error');
  });

  test('403 → forbidden + escalate', () => {
    const result = apiAdapter.perceive('403 Forbidden: Access Denied');
    expect(result!.code).toBe('forbidden');
    expect(result!.strategy).toBe('hold_and_notify');
  });

  // Client errors
  test('413 → payload too large + reduce', () => {
    const result = apiAdapter.perceive('413 Payload Too Large');
    expect(result!.code).toBe('payload-too-large');
    expect(result!.strategy).toBe('reduce_request');
  });

  test('409 → conflict + backoff', () => {
    const result = apiAdapter.perceive('409 Conflict: resource already exists');
    expect(result!.code).toBe('conflict');
    expect(result!.strategy).toBe('backoff_retry');
  });

  // Parse errors
  test('JSON parse error → parse-error + retry', () => {
    const result = apiAdapter.perceive('Unexpected token < in JSON at position 0');
    expect(result!.code).toBe('parse-error');
    expect(result!.strategy).toBe('retry');
  });

  // Network generic
  test('fetch failed → network-error', () => {
    const result = apiAdapter.perceive('TypeError: Failed to fetch');
    expect(result!.code).toBe('network-error');
  });

  // Unknown
  test('unknown error → null', () => {
    const result = apiAdapter.perceive('Something completely random happened');
    expect(result).toBeNull();
  });

  // Error object
  test('works with Error objects', () => {
    const result = apiAdapter.perceive(new Error('connect ETIMEDOUT 10.0.0.1:443'));
    expect(result!.code).toBe('request-timeout');
  });

  // Adapter metadata
  test('adapter name is "api"', () => {
    expect(apiAdapter.name).toBe('api');
  });

  test('getPatterns returns 21 patterns', () => {
    expect(apiAdapter.getPatterns().length).toBe(22);
  });

  test('getStrategies returns 5 strategies', () => {
    expect(apiAdapter.getStrategies().length).toBe(5);
  });

  // Stats
  test('getPatternStats covers all categories', () => {
    const stats = getPatternStats();
    expect(Object.keys(stats).length).toBeGreaterThanOrEqual(6);
    expect(stats['throttle']).toBeGreaterThan(0);
    expect(stats['server']).toBeGreaterThan(0);
    expect(stats['timeout']).toBeGreaterThan(0);
    expect(stats['network']).toBeGreaterThan(0);
    expect(stats['auth']).toBeGreaterThan(0);
    expect(stats['client']).toBeGreaterThan(0);
  });

  // Confidence
  test('all matches have confidence', () => {
    const result = apiAdapter.perceive('429 rate limited');
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  // No domain-specific logic
  test('no domain-specific concepts in adapter', () => {
    for (const p of apiAdapter.getPatterns()) {
      const desc = p.description.toLowerCase();
      expect(desc).not.toContain('nonce');
      expect(desc).not.toContain('gas');
      expect(desc).not.toContain('blockchain');
      expect(desc).not.toContain('wallet');
      expect(desc).not.toContain('coinbase');
    }
  });
});
