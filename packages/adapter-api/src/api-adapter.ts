/**
 * Generic HTTP/API self-healing adapter for Vial.
 *
 * Covers common API failure patterns:
 * - Rate limiting (429)
 * - Server errors (500, 502, 503, 504)
 * - Timeouts (ETIMEDOUT, ESOCKETTIMEDOUT)
 * - Connection errors (ECONNREFUSED, ECONNRESET)
 * - DNS errors (ENOTFOUND)
 * - Auth errors (401, 403)
 * - Request errors (400, 413, 422)
 *
 * 100% generic — no domain-specific logic.
 * Works with any HTTP client (fetch, axios, got, etc.)
 */

export interface ApiPattern {
  pattern: string | RegExp;
  code: string;
  category: string;
  strategy: string;
  description: string;
}

const API_PATTERNS: ApiPattern[] = [
  // Rate limiting
  {
    pattern: /429|rate.?limit|too.?many.?requests|throttl/i,
    code: 'rate-limited',
    category: 'throttle',
    strategy: 'backoff_retry',
    description: 'Server rate limit exceeded — exponential backoff',
  },

  // Server errors
  {
    pattern: /500|internal.?server.?error/i,
    code: 'server-error-500',
    category: 'server',
    strategy: 'retry',
    description: 'Internal server error — simple retry',
  },
  {
    pattern: /502|bad.?gateway/i,
    code: 'server-error-502',
    category: 'server',
    strategy: 'retry',
    description: 'Bad gateway — retry (upstream server issue)',
  },
  {
    pattern: /503|service.?unavailable/i,
    code: 'server-unavailable',
    category: 'server',
    strategy: 'backoff_retry',
    description: 'Service unavailable — backoff and retry',
  },
  {
    pattern: /504|gateway.?timeout/i,
    code: 'gateway-timeout',
    category: 'timeout',
    strategy: 'backoff_retry',
    description: 'Gateway timeout — backoff and retry',
  },

  // Timeout errors
  {
    pattern: /ETIMEDOUT|timed?\s*out|timeout|deadline.?exceeded/i,
    code: 'request-timeout',
    category: 'timeout',
    strategy: 'backoff_retry',
    description: 'Request timed out — retry with backoff',
  },
  {
    pattern: /ESOCKETTIMEDOUT|socket.?timeout/i,
    code: 'socket-timeout',
    category: 'timeout',
    strategy: 'backoff_retry',
    description: 'Socket timed out — retry with backoff',
  },

  // Connection errors
  {
    pattern: /ECONNREFUSED|connection.?refused/i,
    code: 'connection-refused',
    category: 'network',
    strategy: 'backoff_retry',
    description: 'Connection refused — server may be down, retry with backoff',
  },
  {
    pattern: /ECONNRESET|connection.?reset/i,
    code: 'connection-reset',
    category: 'network',
    strategy: 'retry',
    description: 'Connection reset — transient network issue, retry',
  },
  {
    pattern: /ECONNABORTED|connection.?aborted/i,
    code: 'connection-aborted',
    category: 'network',
    strategy: 'retry',
    description: 'Connection aborted — retry',
  },
  {
    pattern: /EPIPE|broken.?pipe/i,
    code: 'broken-pipe',
    category: 'network',
    strategy: 'retry',
    description: 'Broken pipe — retry with fresh connection',
  },

  // DNS errors
  {
    pattern: /ENOTFOUND|dns|getaddrinfo/i,
    code: 'dns-error',
    category: 'network',
    strategy: 'backoff_retry',
    description: 'DNS resolution failed — may be temporary, retry with backoff',
  },

  // SSL/TLS errors
  {
    pattern: /SSL|TLS|certificate|CERT_|ERR_TLS/i,
    code: 'ssl-error',
    category: 'security',
    strategy: 'hold_and_notify',
    description: 'SSL/TLS error — likely needs manual intervention',
  },

  // Auth errors
  {
    pattern: /401|unauthorized|unauthenticated|invalid.?token|expired.?token|token.?expired/i,
    code: 'auth-error',
    category: 'auth',
    strategy: 'renew_session',
    description: 'Authentication failed — refresh token and retry',
  },
  {
    pattern: /403|forbidden|access.?denied|permission/i,
    code: 'forbidden',
    category: 'auth',
    strategy: 'hold_and_notify',
    description: 'Forbidden — likely needs permission change, escalate',
  },

  // Client request errors
  {
    pattern: /400|bad.?request|malformed/i,
    code: 'bad-request',
    category: 'client',
    strategy: 'hold_and_notify',
    description: 'Bad request — request needs fixing, escalate',
  },
  {
    pattern: /413|payload.?too.?large|entity.?too.?large|request.?too.?large/i,
    code: 'payload-too-large',
    category: 'client',
    strategy: 'reduce_request',
    description: 'Payload too large — reduce request size',
  },
  {
    pattern: /422|unprocessable|validation/i,
    code: 'validation-error',
    category: 'client',
    strategy: 'hold_and_notify',
    description: 'Validation error — request data needs fixing',
  },
  {
    pattern: /404|not.?found/i,
    code: 'not-found',
    category: 'client',
    strategy: 'hold_and_notify',
    description: 'Resource not found — check URL',
  },
  {
    pattern: /409|conflict/i,
    code: 'conflict',
    category: 'client',
    strategy: 'backoff_retry',
    description: 'Conflict — resource state issue, retry after delay',
  },

  // JSON parse errors
  {
    pattern: /JSON|parse.?error|unexpected.?token|syntax.?error.*json/i,
    code: 'parse-error',
    category: 'data',
    strategy: 'retry',
    description: 'Response parse error — may be transient, retry',
  },

  // Generic network
  {
    pattern: /network|fetch.?failed|failed.?to.?fetch|ERR_NETWORK/i,
    code: 'network-error',
    category: 'network',
    strategy: 'backoff_retry',
    description: 'Generic network error — retry with backoff',
  },
];

/**
 * PlatformAdapter implementation for generic HTTP/API calls.
 */
export const apiAdapter = {
  name: 'api',

  perceive(error: Error | string): {
    code: string;
    category: string;
    strategy: string;
    confidence?: number;
  } | null {
    const msg = typeof error === 'string' ? error : error.message;
    if (!msg) return null;

    for (const pattern of API_PATTERNS) {
      const regex = pattern.pattern instanceof RegExp
        ? pattern.pattern
        : new RegExp(pattern.pattern, 'i');

      if (regex.test(msg)) {
        return {
          code: pattern.code,
          category: pattern.category,
          strategy: pattern.strategy,
          confidence: 0.85,
        };
      }
    }

    return null;
  },

  getPatterns(): ApiPattern[] {
    return API_PATTERNS;
  },

  getStrategies() {
    return [
      { name: 'retry', description: 'Immediate retry', action: 'retry' as const },
      { name: 'backoff_retry', description: 'Exponential backoff then retry', action: 'retry' as const },
      { name: 'renew_session', description: 'Refresh auth token then retry', action: 'modify' as const },
      { name: 'reduce_request', description: 'Reduce payload size then retry', action: 'modify' as const },
      { name: 'hold_and_notify', description: 'Escalate to human — cannot auto-fix', action: 'escalate' as const },
    ];
  },
};

/** Get adapter pattern count by category. */
export function getPatternStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const p of API_PATTERNS) {
    stats[p.category] = (stats[p.category] || 0) + 1;
  }
  return stats;
}
