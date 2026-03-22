# @helix-agent/core

**Self-healing infrastructure for AI agent payments.**

Every payment failure only needs to be solved once. `wrap()` makes any async function self-healing.

[![npm](https://img.shields.io/npm/v/@helix-agent/core)](https://www.npmjs.com/package/@helix-agent/core)
[![tests](https://img.shields.io/badge/tests-151%20passing-brightgreen)]()
[![license](https://img.shields.io/badge/license-MIT-blue)]()

## Install

```bash
npm install @helix-agent/core
```

## Quick Start

```typescript
import { wrap } from '@helix-agent/core';

const safePay = wrap(myPaymentFunction, { mode: 'auto' });
const result = await safePay({ to: '0x...', amount: 100 });
// If it fails → Helix diagnoses → repairs → retries → you get the result
```

**That's it.** One line. Your agent now self-heals.

## How It Works

```
Error → PERCEIVE → CONSTRUCT → EVALUATE → COMMIT → VERIFY → GENE MAP
                                                              ↓
Next time: Error → Gene Map hit → IMMUNE ⚡ (<1ms)
```

When your function throws, Helix:
1. **Perceives** — classifies the error (nonce? balance? rate limit?)
2. **Constructs** — generates repair candidates from all platform adapters
3. **Evaluates** — scores by cost, speed, and historical success (Q-value)
4. **Commits** — executes the winning strategy
5. **Verifies** — confirms the fix actually worked
6. **Stores Gene** — next time → instant IMMUNE fix

## Three Safety Modes

```typescript
wrap(fn, { mode: 'observe' })  // Diagnose only. Zero risk. Default.
wrap(fn, { mode: 'auto' })     // Retry + param fix. No fund movement.
wrap(fn, { mode: 'full' })     // All repairs including chain writes.
```

## Platform Coverage

| Platform | Scenarios | Examples |
|----------|-----------|---------|
| **Tempo/MPP** | 13 | nonce, session, DEX, compliance, cascade |
| **Privy** | 7 | policy, gas sponsor, cross-chain, broadcast |
| **Coinbase** | 8+ | CDP API, Paymaster/ERC-4337, x402 |
| **Generic HTTP** | 3 | 429, 500, timeout |

**31 scenarios. 25 real strategies. 5 platforms.**

## Auto-Detect

Helix auto-detects your function's parameter shape:

```typescript
// viem transaction → auto-injects corrected nonce/gas
wrap(sendTx, { mode: 'auto' })

// HTTP fetch → auto-retries with backoff
wrap(fetch, { mode: 'auto' })

// No parameterModifier needed. Helix figures it out.
```

## Key Features

- **Gene Map** — SQLite database of proven repairs. Q-value RL scoring. Seed genes for day-1 immunity
- **Cross-Platform Immunity** — Fix learned on Tempo auto-heals same error on Coinbase
- **viem Integration** — Real chain reads/writes via publicClient + walletClient
- **DEX Swap** — Uniswap V3 on Base/Ethereum (swap_currency, split_swap)
- **Safety** — Kill switch, cost ceiling, allowlist/blocklist, Zod validation
- **Idempotency** — repair_id prevents double execution
- **Root Cause Analysis** — 13 root cause mappings (MAST paper)
- **Failure Attribution** — Track which agent, which step fails most
- **simulate()** — Dry-run diagnosis for CI testing

## API

```typescript
import { wrap, createEngine, simulate } from '@helix-agent/core';

// wrap() — main API
const safeFn = wrap(fn, {
  mode: 'auto',
  agentId: 'my-agent',
  maxRepairCostUsd: 1.00,
  onRepair: (result) => console.log(result.winner?.strategy),
});

// createEngine() — advanced
const engine = createEngine({ mode: 'observe' });
const result = await engine.repair(new Error('nonce mismatch'));

// simulate() — CI testing
const diagnosis = simulate({ error: 'AA25 invalid account nonce' });
```

## CLI

```bash
npx helix status                           # Gene Map health
npx helix simulate "AA25 invalid nonce"    # Dry-run diagnosis
npx helix gc                               # Garbage collection
npx helix stats my-agent                   # Agent attribution
```

## Verified on Real Chain

5 real transaction hashes on Base Sepolia (testnet):
- Nonce auto-repair via `wrap()` → corrected nonce → tx confirmed
- HTTP 429 → `backoff_retry` → waited 2s → retried → success
- All verifiable on [sepolia.basescan.org](https://sepolia.basescan.org)

## Documentation

- [User Runbook](https://github.com/adrianhihi/helix/blob/main/docs/RUNBOOK.md) — Complete guide from install to production
- [GitHub](https://github.com/adrianhihi/helix) — Source, examples, dashboard
- [CONTRIBUTING](https://github.com/adrianhihi/helix/blob/main/CONTRIBUTING.md) — How to contribute
- [STRATEGIES](https://github.com/adrianhihi/helix/blob/main/STRATEGIES.md) — All 26 strategies with implementation status

## License

MIT
