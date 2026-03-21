<div align="center">

# Helix

**Self-healing infrastructure for AI agent payments**

Every payment failure on the internet should only need to be solved once.

[![npm](https://img.shields.io/npm/v/@helix-agent/core)](https://www.npmjs.com/package/@helix-agent/core)
[![tests](https://img.shields.io/badge/tests-135%2B%20passing-brightgreen)]()
[![license](https://img.shields.io/badge/license-MIT-blue)]()

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [API](#api) · [Dashboard](#dashboard) · [MCP Server](#mcp-server)

</div>

---

## The Problem

AI agents fail at payments. A lot.

```
Agent tries to pay → nonce mismatch → retry → wrong chain → retry → gas too low → give up
```

Every agent team builds the same retry logic. The same error handling. The same on-call rotations. **None of them learn from each other.**

## The Solution

Helix wraps your agent with a self-healing immune system. When a payment fails, Helix diagnoses the error, selects a repair strategy, executes it, verifies the fix, and stores the solution in a **Gene Map** — so the same failure never costs you twice.

```
Error → PERCEIVE → CONSTRUCT → EVALUATE → COMMIT → VERIFY → GENE MAP
                                                              ↓
Next time: Error → Gene Map hit → IMMUNE ⚡ (<100ms, $0)
```

**Retry is a hammer. PCEC is a surgeon.**

## Quick Start

```bash
npm install @helix-agent/core
```

```typescript
import { wrap } from '@helix-agent/core';

const safePay = wrap(myPaymentFunction, {
  mode: 'observe',        // diagnose only (default) — zero risk
  agentId: 'my-agent',
  maxRepairCostUsd: 0.50, // cost ceiling for auto-repairs
});

const result = await safePay({ to: '0x...', amount: '1.0' });
```

**That's it.** One import, one wrap. Your agent now self-heals.

## How It Works

### PCEC Engine

| Stage | What happens | Time |
|-------|-------------|------|
| **Perceive** | Classify error → code + category + severity + root cause | <1ms |
| **Construct** | Generate candidate repair strategies, ranked by Q-value | <1ms |
| **Evaluate** | Score candidates: cost, speed, safety, Gene Map history | <1ms |
| **Commit** | Execute the winning strategy (if mode allows) | varies |
| **Verify** | Validate the repair actually worked (SAGE paper) | <1ms |
| **Gene** | Store successful fix in Gene Map for future immunity | <1ms |

### Gene Map — Collective Immunity

The Gene Map is a local database of proven repair strategies:

- **Q-value scoring** (MemRL paper) — reinforcement learning ranks strategies
- **Seed Genes** — new users get 12 pre-loaded immunities from day 1
- **Gene Combine** (ELL paper) — duplicate genes merge into stronger ones
- **Root cause hints** (MAST paper) — systematic failures get flagged
- **Failure attribution** — track which agent, which step, which workflow
- **Gene links** (A-Mem paper) — co-occurring failures are linked

### Three Safety Modes

| Mode | Execution | Use case |
|------|-----------|----------|
| `observe` | Diagnose only, zero execution | Default, CI testing |
| `auto` | Execute Category A+B (no fund movement) | Production read-only |
| `full` | Execute Category C (fund movement) | Production with cost ceiling |

## Platform Coverage

| Platform | Scenarios | Examples |
|----------|-----------|---------|
| **Tempo/MPP** | 13 | balance, nonce, session, DEX, compliance, cascade |
| **Privy** | 7 | policy, gas sponsor, cross-chain, broadcast |
| **Coinbase** | 8+ | CDP API, Paymaster/ERC-4337, x402 |
| **Generic HTTP** | 3 | 429, 500, timeout |
| **Any** | ∞ | `wrap()` works on any async function |

**31 scenarios. 25 real strategies. 5 platforms.**

## API

### `wrap(fn, options)`

```typescript
const safeFn = wrap(myFunction, {
  mode: 'observe' | 'auto' | 'full',
  agentId: 'my-agent',
  maxRepairCostUsd: 0.50,
  blockStrategies: ['self_pay_gas'],
  onRepair: (result) => console.log(result),
  onSystematic: (alert) => pagerduty.trigger(alert),
});
```

### `simulate(options)` — Test without executing

```typescript
import { simulate } from '@helix-agent/core';

const result = simulate({ error: 'AA25 Invalid account nonce' });
console.log(result.recommended.strategy); // 'refresh_nonce'
console.log(result.immune);               // true (seed gene)
console.log(result.rootCauseHint);         // 'concurrent_wallet_access'
```

### Engine API

```typescript
import { createEngine } from '@helix-agent/core';

const engine = createEngine({ mode: 'observe', agentId: 'bot-1' });
const result = await engine.repair(error, context);

engine.getGeneMap().gc();                    // combine + prune
engine.getGeneMap().getAgentStats('bot-1');  // failure attribution
engine.getGeneMap().getRelatedFailures('verification-failed', 'signature');
```

## CLI

```bash
npx helix status                              # Gene Map health
npx helix simulate "AA25 Invalid account nonce" # dry-run diagnosis
npx helix gc                                   # garbage collection
npx helix stats bot-1                          # agent attribution
```

## Dashboard

```bash
npm run dash  # → http://localhost:7842
```

## MCP Server

```bash
npx @helix-agent/mcp
```

Tools: `helix_diagnose` · `helix_repair` · `helix_gene_status` · `helix_check_immunity`

## MPP API

Live at `https://helix-production-e110.up.railway.app`

```bash
curl -X POST .../v1/diagnose \
  -H "Content-Type: application/json" \
  -d '{"error": "AA25 Invalid account nonce"}'
```

Listed on [mppscan.com](https://mppscan.com).

## Research Foundations

| Paper | Implementation |
|-------|----------------|
| MemRL (2026) | Gene Map Q-value scoring |
| SAGE (2025) | PCEC Verify stage |
| ELL (2025) | Gene Combine |
| MAST (2025) | Root cause hints |
| ReasoningBank | Gene reasoning fields |
| A-Mem | Gene relationship links |
| Who&When | Failure attribution |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

---

<div align="center">

**We're not competing with LLMs. We're caching their intelligence.**

[npm](https://www.npmjs.com/package/@helix-agent/core) · [GitHub](https://github.com/adrianhihi/helix) · [API](https://helix-production-e110.up.railway.app/health) · [mppscan](https://mppscan.com)

</div>
