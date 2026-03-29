# @vial-agent/adapter-api

**Generic HTTP/API self-healing adapter for [Vial](https://github.com/adrianhihi/helix).**

Covers 21 common API failure patterns across 7 categories: rate limiting, server errors, timeouts, connection errors, auth failures, client errors, and parse errors.

## Quick Start

```bash
npm install @vial-agent/adapter-api
```

```typescript
import { wrap } from '@vial-agent/core';
import { apiAdapter } from '@vial-agent/adapter-api';

const safeFetch = wrap(myApiCall, { adapter: apiAdapter, mode: 'auto' });

// These errors are now auto-healed:
// 429 Too Many Requests    → exponential backoff + retry
// 500 Internal Server Error → retry
// ETIMEDOUT                → backoff + retry
// ECONNREFUSED             → backoff + retry
// 401 Unauthorized         → refresh token + retry
// 413 Payload Too Large    → reduce request size
```

## Patterns (21)

| Category | Patterns | Strategy |
|----------|----------|----------|
| Throttle | 429, rate limit | backoff_retry |
| Server | 500, 502, 503, 504 | retry / backoff_retry |
| Timeout | ETIMEDOUT, socket timeout, gateway timeout | backoff_retry |
| Network | ECONNREFUSED, ECONNRESET, DNS, broken pipe | retry / backoff_retry |
| Auth | 401, 403 | renew_session / escalate |
| Client | 400, 404, 409, 413, 422 | reduce / escalate |
| Data | JSON parse error | retry |

## License

MIT
