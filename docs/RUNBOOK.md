# Helix — User Runbook

> Complete guide from installation to production. Every parameter, every mode, every verification step.

---

## Table of Contents

1. [5-Minute Quick Start](#1-5-minute-quick-start)
2. [wrap() Full Parameter Reference](#2-wrap-full-parameter-reference)
3. [Three Modes Explained](#3-three-modes-explained)
4. [Real-World Examples](#4-real-world-examples)
5. [How to Verify Helix Is Working](#5-how-to-verify-helix-is-working)
6. [Testing & CI Integration](#6-testing--ci-integration)
7. [CLI Commands](#7-cli-commands)
8. [Gene Map Guide](#8-gene-map-guide)
9. [Safety Guarantees](#9-safety-guarantees)
10. [FAQ](#10-faq)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. 5-Minute Quick Start

### Install

```bash
npm install @helix-agent/core
```

### Minimal Usage (3 Lines)

```typescript
import { wrap } from '@helix-agent/core';

// Your existing payment function — unchanged
async function myPayment(params) {
  const response = await fetch('https://api.example.com/pay', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Add Helix — one line
const safePayment = wrap(myPayment, { mode: 'observe' });

// Usage is identical
const result = await safePayment({ to: '0x...', amount: 100 });
```

**That's it.** If `myPayment` fails, Helix will:
- `observe` mode: tell you how it would fix it, but doesn't execute
- `auto` mode: automatically repair and retry
- Either way, Helix remembers the error — next time is faster

### Verify Installation

```bash
node -e "const { wrap } = require('@helix-agent/core'); console.log('✅ Helix installed')"
```

---

## 2. wrap() Full Parameter Reference

```typescript
const safeFn = wrap(yourFunction, {
  // ── Must understand ──
  mode: 'observe',        // See Section 3

  // ── Recommended ──
  agentId: 'my-agent',    // Your agent's name, used for tracking

  // ── Chain operations only ──
  provider: {
    rpcUrl: 'https://...',   // Chain RPC endpoint
    privateKey: '0x...',     // Wallet key (only needed in full mode)
  },

  // ── Safety ──
  maxRepairCostUsd: 1.00,    // Max cost per repair (USD)
  maxRetries: 2,             // Max retry attempts (default 2)
  allowStrategies: [...],    // Only allow these strategies
  blockStrategies: [...],    // Block these strategies
  enabled: true,             // false = Helix fully transparent, no intervention

  // ── Callbacks ──
  onRepair: (result) => {},  // Called on successful repair
  onFailure: (result) => {}, // Called when all strategies fail

  // ── Advanced (most users don't need) ──
  geneMapPath: './helix.db', // Gene Map storage path (default: helix-genes.db)
  verbose: true,             // Print detailed logs
  context: {},               // Extra context info
  parameterModifier: null,   // Custom parameter modifier (usually not needed)
});
```

### Parameter Details

#### `mode` (Most Important)

```
'observe'  → Diagnose only, no execution, no retry. Default. Zero risk.
'auto'     → Auto-execute safe repairs (retry + param modification). No fund movement.
'full'     → Execute all repairs, including on-chain transactions. Requires privateKey + maxRepairCostUsd.
```

Recommended path: Start with `observe` for 1-2 weeks → Confirm diagnoses are accurate → Upgrade to `auto` → Confirm safety → Upgrade to `full`

#### `agentId`

```typescript
agentId: 'order-processor'  // Give your agent a name
```

Used for:
- Gene Map tracks which agent performed the repair
- `npx helix stats order-processor` shows failure stats for this agent
- Multiple agents with different agentIds lets you track which one has the most issues

#### `provider`

```typescript
provider: {
  rpcUrl: 'https://sepolia.base.org',  // EVM chain RPC
  privateKey: '0x...',                  // Wallet private key
}
```

When you need it:
- Not needed: You're only wrapping HTTP API calls (429, 500, timeout)
- rpcUrl only: Helix needs to read chain data (nonce, balance)
- rpcUrl + privateKey: mode is `full`, Helix needs to send chain transactions

**Security note:** Helix does NOT use the private key in observe or auto mode. Only full mode + explicit maxRepairCostUsd triggers fund movement.

#### `maxRepairCostUsd`

```typescript
maxRepairCostUsd: 1.00  // Helix will spend at most $1 per repair
```

Only applies in `full` mode. If a strategy's estimated cost exceeds this → auto-downgrade to observe (recommend only, don't execute).

Reasonable values:
- Testing: 0.10
- Production (small transactions): 1.00
- Production (large transactions): 5.00
- Never set too high — this is your safety net

#### `maxRetries`

```typescript
maxRetries: 2  // Default 2, at most 2 retries (3 total attempts)
```

- Set 1: Retry once (for idempotent operations)
- Set 2: Default, works for most scenarios
- Set 3-5: Non-idempotent operations or unstable networks

#### `allowStrategies` / `blockStrategies`

```typescript
// Option 1: Only allow these strategies (whitelist)
allowStrategies: ['backoff_retry', 'refresh_nonce', 'retry']

// Option 2: Block these strategies (blacklist)
blockStrategies: ['swap_currency', 'split_transaction', 'self_pay_gas']

// Cannot set both at the same time
```

All available strategies:
```
Safe (Category A — no chain interaction):
  backoff_retry         Wait then retry
  retry                 Immediate retry
  retry_with_receipt    Retry with receipt proof
  reduce_request        Reduce request amount
  fix_params            Fix transaction parameters
  switch_endpoint       Switch API endpoint
  hold_and_notify       Pause and notify operator
  extend_deadline       Extend timeout deadline

Chain read (Category B — read-only):
  refresh_nonce         Read correct nonce from chain
  switch_network        Switch network/chain
  get_balance           Query balance

Chain write (Category C — requires full mode):
  self_pay_gas          Pay gas directly
  cancel_pending_txs    Cancel pending transactions
  speed_up_transaction  Speed up tx (30% gas bump)
  split_transaction     Split large transaction
  topup_from_reserve    Top up from reserve wallet
  swap_currency         DEX token swap
  switch_stablecoin     Switch to different stablecoin
  split_swap            Split DEX swap
  swap_to_usdc          Swap to USDC

Orchestration (Category D — multi-step):
  refund_waterfall      Cascade refund
  remove_and_resubmit   Remove failed item, resubmit
  renew_session         Renew session
  switch_service        Switch service provider
```

#### `enabled`

```typescript
// Static disable
enabled: false  // Helix fully transparent, all calls pass through

// Dynamic disable (runtime kill switch)
enabled: () => !isIncident  // Auto-disable during incidents

// Environment variable
enabled: process.env.HELIX_ENABLED !== 'false'
```

#### `onRepair` / `onFailure`

```typescript
onRepair: (result) => {
  console.log(`Helix repaired: ${result.winner?.strategy}`);
  slack.send(`Agent ${result.agentId}: ${result.winner?.strategy} fixed ${result.failure?.code}`);
  metrics.increment('helix.repair.success', { strategy: result.winner?.strategy });
},

onFailure: (result) => {
  pagerduty.alert(`Helix could not repair: ${result.failure?.code}`);
},
```

---

## 3. Three Modes Explained

### Observe Mode (Default, Recommended Starting Point)

```typescript
const safePay = wrap(myPayment, { mode: 'observe' });

try {
  await safePay(params);
} catch (error) {
  if (error._helix) {
    console.log('Helix suggests:', error._helix.winner?.strategy);
    console.log('Confidence:', error._helix.winner?.confidence);
    console.log('Explanation:', error._helix.explanation);
  }
}
```

**Behavior:**
- Original function succeeds → returns result directly, Helix does nothing
- Original function fails → Helix diagnoses → attaches diagnosis to error._helix → throws original error
- **No retry, no modification, no execution**

**Best for:**
- First time integrating Helix — see what it would recommend
- Early production — build trust
- Compliance requirements that prohibit auto-execution

### Auto Mode (Most Production Scenarios)

```typescript
const safePay = wrap(myPayment, { mode: 'auto' });

const result = await safePay(params);
// If original call failed, Helix auto-repaired and returned the success result
// result._helix contains repair info
```

**Behavior:**
- Original function succeeds → returns directly
- Original function fails → Helix diagnoses → executes Category A+B strategies → retries
  - 429 → wait 1-3s → retry original call
  - Nonce error → read correct nonce from chain → remove wrong nonce → retry
  - Timeout → wait → retry
- **Will NOT execute Category C (chain write operations)**

**Best for:**
- Primary production mode
- Most errors are fixable with retry + parameter modification

### Full Mode (Use with Caution)

```typescript
const safePay = wrap(myPayment, {
  mode: 'full',
  provider: { rpcUrl: '...', privateKey: '0x...' },
  maxRepairCostUsd: 1.00,     // Required
  allowStrategies: ['refresh_nonce', 'speed_up_transaction'],  // Recommended
});
```

**Behavior:**
- Includes all auto mode capabilities
- Plus Category C: swap, split, gas bump, topup
- **Spends real money** (gas fees + swap fees)
- Exceeds maxRepairCostUsd → auto-downgrade to observe

**Best for:**
- High-value transaction auto-recovery
- Combined with allowStrategies to limit scope
- Must set maxRepairCostUsd

---

## 4. Real-World Examples

### Example 1: Wrapping an HTTP API

```typescript
import { wrap } from '@helix-agent/core';

async function chargeCustomer(orderId: string, amount: number) {
  const res = await fetch('https://api.payment.com/charge', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ orderId, amount }),
  });
  if (!res.ok) throw new Error(`Payment failed: HTTP ${res.status}`);
  return res.json();
}

const safeCharge = wrap(chargeCustomer, {
  mode: 'auto',
  agentId: 'checkout-agent',
  maxRetries: 3,
  onRepair: (r) => console.log(`Helix repaired: ${r.winner?.strategy}`),
});

const result = await safeCharge('ORD-123', 29.99);
// 429 → Helix waits 2s, retries → success
// 500 → Helix retries → success
// timeout → Helix retries → success
```

### Example 2: Wrapping a viem Chain Transaction

```typescript
import { wrap } from '@helix-agent/core';
import { createWalletClient, http, parseEther } from 'viem';
import { base } from 'viem/chains';

const wallet = createWalletClient({ chain: base, transport: http(RPC_URL), account });

async function sendPayment(params: { to: `0x${string}`; value: bigint; nonce?: number }) {
  const tx: any = { to: params.to, value: params.value };
  if (params.nonce !== undefined) tx.nonce = params.nonce;
  const hash = await wallet.sendTransaction(tx);
  return { hash };
}

// Helix auto-detects viem transaction parameters
const safePay = wrap(sendPayment, {
  mode: 'auto',
  agentId: 'transfer-agent',
  provider: { rpcUrl: RPC_URL },
});

await safePay({ to: '0x...', value: parseEther('0.1') });
```

**How does Helix know it's a viem transaction?** It sees `{ to, value }` in the params → auto-detects as viem-tx → knows how to modify nonce/gas/value.

### Example 3: Coinbase AgentKit

```typescript
import { wrap } from '@helix-agent/core';

async function agentTransfer(params) {
  return await agentKit.wallet.transfer({
    to: params.to,
    amount: params.amount,
    assetId: 'eth',
  });
}

const safeTransfer = wrap(agentTransfer, {
  mode: 'auto',
  agentId: 'coinbase-agent',
  provider: { rpcUrl: 'https://sepolia.base.org' },
});

// AA25 nonce error → Helix auto-repairs
await safeTransfer({ to: '0x...', amount: '0.01' });
```

### Example 4: Observe Mode for Logging Only

```typescript
const safePay = wrap(myPayment, {
  mode: 'observe',
  agentId: 'monitor-only',
  onRepair: (result) => {
    logger.info('Helix diagnosis', {
      error: result.failure?.code,
      category: result.failure?.category,
      suggestion: result.winner?.strategy,
      confidence: result.winner?.confidence,
      rootCause: result.failure?.rootCauseHint,
    });
  },
});
```

---

## 5. How to Verify Helix Is Working

### Method 1: Verbose Logging

```typescript
const safePay = wrap(fn, { mode: 'auto', verbose: true });
```

You'll see:
```
[helix] Payment failed (attempt 1/2), engaging PCEC...
⚡ IMMUNE via refresh_nonce in 125ms ($100 protected)
[helix] Auto-applied overrides (viem-tx): nonce
```

### Method 2: onRepair Callback

```typescript
const safePay = wrap(fn, {
  mode: 'auto',
  onRepair: (result) => {
    console.log('=== HELIX REPAIR ===');
    console.log('Error:', result.failure?.code, '/', result.failure?.category);
    console.log('Strategy:', result.winner?.strategy ?? result.gene?.strategy);
    console.log('Immune:', result.immune);
    console.log('Time:', result.totalMs, 'ms');
    console.log('====================');
  },
});
```

### Method 3: Check \_helix on Return Value

```typescript
const result = await safePay(params);

if (result._helix) {
  console.log('Helix intervened!');
  console.log('Strategy:', result._helix.strategy);
  console.log('Attempts:', result._helix.attempts);
  console.log('Immune:', result._helix.immune);
  console.log('Time:', result._helix.totalMs, 'ms');
} else {
  console.log('Original call succeeded, Helix did not intervene');
}
```

### Method 4: CLI

```bash
npx helix status       # Gene Map health, strategies, Q-values
npx helix stats my-agent  # This agent's repair statistics
```

### Method 5: simulate() Dry-Run

```typescript
import { simulate } from '@helix-agent/core';

const result = simulate({ error: 'AA25 invalid account nonce' });
console.log(result.recommended?.strategy);  // 'refresh_nonce'
console.log(result.immune);                 // true (seed gene)
console.log(result.rootCauseHint);          // 'concurrent_wallet_access'
```

---

## 6. Testing & CI Integration

### Method 1: simulate() (Recommended)

No network, no chain, no cost. Run in CI:

```typescript
import { describe, it, expect } from 'vitest';
import { simulate } from '@helix-agent/core';

describe('Helix integration', () => {
  it('diagnoses nonce errors correctly', () => {
    const result = simulate({ error: 'nonce mismatch' });
    expect(result.recommended).not.toBeNull();
    expect(result.recommended.strategy).toBe('refresh_nonce');
  });

  it('diagnoses rate limits correctly', () => {
    const result = simulate({ error: 'HTTP 429: Too Many Requests' });
    expect(result.recommended.strategy).toBe('backoff_retry');
  });

  it('provides immunity for known errors', () => {
    const result = simulate({ error: 'nonce mismatch' });
    expect(result.immune).toBe(true);
  });

  it('includes root cause hint', () => {
    const result = simulate({ error: 'nonce mismatch' });
    expect(result.rootCauseHint).toBeDefined();
  });
});
```

### Method 2: wrap() + Mock Function

```typescript
it('wrap() retries on 429', async () => {
  let callCount = 0;
  const flaky = async () => {
    callCount++;
    if (callCount === 1) throw new Error('HTTP 429: rate limited');
    return { success: true };
  };

  const safe = wrap(flaky, { mode: 'auto', agentId: 'test' });
  const result = await safe();

  expect(callCount).toBe(2);
  expect(result._helix?.repaired).toBe(true);
});
```

### Method 3: Real E2E (Optional, Requires Testnet)

```bash
export HELIX_TEST_PRIVATE_KEY=0x...
npx tsx examples/real-e2e/payment-agent.ts
# Runs real transactions on Base Sepolia
```

---

## 7. CLI Commands

```bash
# Gene Map status
npx helix status
┌─────────────────────────────────────┐
│  HELIX Gene Map Status              │
│  Total Genes:     12                │
│  Avg Q-Value:   0.786               │
│  Top: refresh_nonce      q=0.88     │
│       backoff_retry      q=0.85     │
└─────────────────────────────────────┘

# Simulate diagnosis (no execution)
npx helix simulate "AA25 invalid account nonce"
┌─────────────────────────────────────┐
│  Code:     verification-failed      │
│  Category: signature                │
│  Strategy: refresh_nonce            │
│  Immune:   true ⚡                  │
└─────────────────────────────────────┘

# Gene Map garbage collection
npx helix gc
│  Merged:    3                       │
│  Pruned:    1                       │
│  Archived:  0                       │

# Agent statistics
npx helix stats my-agent
│  Total Failures:  47                │
│  Success Rate:    94.2%             │
│  Top Category:    nonce (67%)       │
```

---

## 8. Gene Map Guide

### What Is the Gene Map?

A local SQLite database that stores repair knowledge Helix has learned. Each record is called a "Gene."

### What Does a Gene Look Like?

```
Gene {
  failureCode:    'verification-failed'     // Error type
  category:       'signature'                // Error category
  strategy:       'refresh_nonce'            // Repair strategy
  qValue:         0.88                       // Effectiveness score (0-1)
  successCount:   15                         // Number of successful repairs
  avgRepairMs:    180                        // Average repair time
  platforms:      ['tempo', 'privy']         // Platforms where this was validated
  reasoning:      'Chain is source of truth' // Why this strategy works
}
```

### What Is Q-value?

A strategy's reliability score, between 0 and 1:

```
0.0 - 0.3  → Unreliable, will be pruned soon
0.3 - 0.5  → Trial phase
0.5 - 0.7  → Effective
0.7 - 0.9  → Very reliable
0.9 - 1.0  → Highly reliable
```

Each successful repair → Q-value increases (toward 1.0)
Each failed repair → Q-value decreases (toward 0.0)
Formula: `q = q + 0.1 × (reward - q)`, where reward is 1 (success) or 0 (failure)

### What Does IMMUNE Mean?

```
1st time nonce error → Helix runs full PCEC pipeline (~5ms) → stores Gene
2nd time nonce error → Gene Map hit → IMMUNE ⚡ → uses previous strategy (<1ms)
```

IMMUNE threshold: Gene's q_value > 0.4

### Where Is the Gene Map File?

```
Default: ./helix-genes.db in current directory
Custom:  wrap(fn, { geneMapPath: '/path/to/my-genes.db' })
Memory:  wrap(fn, { geneMapPath: ':memory:' })  // Lost on process exit
```

### What Are Seed Genes?

Fresh Helix installations come with 12 pre-loaded Genes covering the most common errors:

```
nonce mismatch      → refresh_nonce      (q=0.85)
insufficient balance → reduce_request    (q=0.82)
rate limit          → backoff_retry      (q=0.88)
network mismatch    → switch_network     (q=0.80)
server error        → retry_with_receipt (q=0.78)
timeout             → backoff_retry      (q=0.75)
policy violation    → split_transaction  (q=0.76)
session expired     → renew_session      (q=0.82)
...
```

You have immunity from day one.

---

## 9. Safety Guarantees

### What Helix Will NEVER Do

```
❌ Execute any action in observe mode
❌ Send chain transactions or move funds in auto mode
❌ Spend money without maxRepairCostUsd set
❌ Intervene when enabled: false
❌ Store your private key (used at runtime only, never persisted)
❌ Upload any data to external servers (Gene Map is local)
```

### How to Shut Down Helix Immediately

```typescript
// Method 1: Parameter
wrap(fn, { enabled: false });

// Method 2: Environment variable
HELIX_ENABLED=false npm start

// Method 3: Dynamic switch
wrap(fn, { enabled: () => !isIncident });
```

No redeployment needed. Takes effect immediately.

### Cost Control

```typescript
wrap(fn, {
  mode: 'full',
  maxRepairCostUsd: 0.50,
  blockStrategies: [
    'swap_currency',
    'split_transaction',
    'topup_from_reserve',
  ],
});
```

If repair cost exceeds ceiling → auto-downgrade to observe → tells you what to do, doesn't execute.

---

## 10. FAQ

### "Does wrap() affect my function's performance?"

Normal case (no errors): Nearly zero overhead. wrap() is just a try/catch wrapper.
Error case: PCEC diagnosis < 5ms, Gene Map lookup < 0.1ms (memory cache).
IMMUNE path: < 1ms.

### "Will the Gene Map grow unbounded?"

No. Gene Map has automatic cleanup:
- Q-value < 0.1 + 3 consecutive failures → auto-deleted
- Duplicate Genes → auto-merged
- 180 days unused → archived
- Target: < 500 active Genes

### "Can multiple agents share a Gene Map?"

Yes. Point them to the same geneMapPath file:
```typescript
wrap(fn1, { geneMapPath: './shared-genes.db', agentId: 'agent-1' });
wrap(fn2, { geneMapPath: './shared-genes.db', agentId: 'agent-2' });
// Repairs learned by agent-1 automatically immunize agent-2
```

### "What errors are supported?"

Helix has built-in recognition for 31 error scenarios covering:
- HTTP errors (429, 500, 502, 503, 504, timeout)
- EVM chain errors (nonce, gas, balance, revert)
- ERC-4337 errors (AA25, AA21, AA13, policy, paymaster)
- Coinbase errors (CDP API, x402)
- Privy errors (policy, gas sponsor, cross-chain)
- Tempo errors (session, currency, DEX, compliance)

Errors not in the list → Generic adapter fallback → keyword-based matching

### "Do I need an API key?"

No. Helix runs entirely locally. No external service calls, no data uploads.

---

## 11. Troubleshooting

### "Helix isn't catching errors"

```typescript
// Confirm enabled is not false
wrap(fn, { enabled: true, verbose: true });

// Check: Is your function async? wrap() only handles Promise rejections
// ❌ Synchronous functions don't work
const bad = wrap(() => { throw new Error('sync') });
// ✅ Async functions
const good = wrap(async () => { throw new Error('async') });
```

### "IMMUNE isn't triggering"

```typescript
// Gene Map might be :memory: (lost on restart)
// Switch to a file path:
wrap(fn, { geneMapPath: './helix-genes.db' });

// Or check Gene Q-value is > 0.4
// npx helix status
```

### "Nonce repair isn't working"

```typescript
// Make sure rpcUrl is provided (Helix needs to read on-chain nonce)
wrap(fn, {
  mode: 'auto',
  provider: { rpcUrl: 'https://sepolia.base.org' },
});

// Make sure your function accepts a nonce parameter
// Helix auto-detect needs to see { to, value, nonce? } parameter shape
```

### "Not sure what Helix is doing"

```typescript
// Enable verbose
wrap(fn, { verbose: true });

// Or use observe mode to see diagnoses
wrap(fn, { mode: 'observe', onRepair: console.log });
```

### Getting Help

```bash
npx helix help                         # CLI help
npx helix simulate "your error message" # See how Helix would handle it
```

GitHub Issues: https://github.com/adrianhihi/helix/issues
