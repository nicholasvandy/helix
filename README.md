<div align="center">

# Helix

**Self-healing infrastructure for AI agent payments**

[![npm](https://img.shields.io/npm/v/@helix-agent/core?style=flat-square&color=f0a030)](https://www.npmjs.com/package/@helix-agent/core)
[![tests](https://img.shields.io/badge/tests-489%20passed-4ade80?style=flat-square)](https://github.com/adrianhihi/helix/actions)
[![accuracy](https://img.shields.io/badge/diagnostic%20accuracy-100%25-60a5fa?style=flat-square)]()
[![platforms](https://img.shields.io/badge/platforms-Coinbase%20%7C%20Tempo%20%7C%20Privy-a78bfa?style=flat-square)]()
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

Your agent's payment fails. Helix diagnoses, repairs, and learns — automatically.  
Not a retry wrapper. A wrapper with a brain.

[Quick Start](#quick-start) · [How It Works](#how-it-works) · [Benchmarks](#benchmarks) · [REST API](#rest-api) · [Demo](#demo)

</div>

---

## Demo

![Helix Demo](assets/demo.gif)
<img width="463" height="854" alt="image" src="https://github.com/user-attachments/assets/28824439-b819-4e83-85c7-4906b31e5560" />

*Session expiry, nonce mismatch, gas errors — all diagnosed and repaired in <1ms.*

---

## Quick Start

```bash
npm install @helix-agent/core
```

```typescript
import { wrap } from '@helix-agent/core';

// Before: hope for the best
await agent.pay(invoice);

// After: self-healing
await wrap(agent.pay)(invoice);
```

That's it. One line. Helix handles the rest.

If this helped, please ⭐ — it helps us reach more developers.

---

## How It Works

Helix uses **PCEC** (Perceive → Construct → Evaluate → Commit) — a biologically-inspired self-repair loop:

```
Error occurs
    ↓
⚡ Perceive  — 4-layer classification (adapter → embedding → LLM → unknown)
    ↓
🧬 Construct — Generate repair candidates from Gene Map
    ↓
📊 Evaluate  — Bayesian Q-value + Thompson Sampling + Adaptive Weights
    ↓
✅ Commit    — Safety verification → execute → verify → learn → Gene Map update
    ↓
Second time same error → IMMUNE in <1ms
```

The **Gene Map** remembers every repair. Agent A's failure becomes Agent B's immunity.

### Three Layers of Intelligence

| Layer | What | Speed | Cost |
|-------|------|-------|------|
| Pattern Match + Gene Map | 90% of errors | <5ms | $0 |
| LLM Fallback (Claude/GPT) | 10% unknown errors | ~1-6s | $0.001 |
| Gene Telemetry | Network learns, coverage grows | Background | $0 |

---

## Benchmarks

Validated on Base mainnet with real transaction failures. 32 test cases across Coinbase, Tempo, Privy, and Generic adapters — covering nonce conflicts, gas errors, ERC-4337/AA failures, session expiry, DEX slippage, rate limits, and edge cases.

| Approach | Recovery Rate | Notes |
|----------|:------------:|-------|
| Naive Retry | 22.6% | Same retry for all errors |
| Error-Specific | 67.7% | Manual error handling |
| **Helix PCEC** | **90.3%** | Auto-diagnosis + strategy selection |

| Platform | Diagnostic Accuracy | Test Cases |
|----------|:-------------------:|:----------:|
| Coinbase CDP | 100% | 17/17 |
| Tempo MPP | 100% | 7/7 |
| Privy | 100% | 5/5 |
| Generic | 100% | 3/3 |
| **Overall** | **100%** | **32/32** |

---

## Platform Coverage

| Platform | Patterns | Coverage | Strategies |
|----------|:--------:|:--------:|:----------:|
| **Coinbase CDP** | 25+ | ERC-4337, Paymaster, x402, AA errors, gas | 8 unique |
| **Tempo MPP** | 13 | Session, nonce, gas spike, DEX slippage, RPC | 6 unique |
| **Privy** | 7 | Embedded wallet, signing, gas sponsor, policy | 5 unique |
| **Stripe** | 5 | Payment intents, webhooks | 4 unique |
| **Generic** | 10 | HTTP, timeout, rate limit | 4 unique |

---

## REST API

Helix runs as a sidecar. Any language can use it:

```bash
# Start server
npx helix serve --port 7842 --mode observe

# Send error for diagnosis
curl -X POST http://localhost:7842/repair \
  -H "Content-Type: application/json" \
  -d '{"error":"nonce mismatch: expected 0, got 50","platform":"tempo"}'
```

```json
{
  "success": true,
  "failure": { "code": "verification-failed", "category": "signature", "severity": "high" },
  "strategy": { "name": "refresh_nonce", "action": "refresh_state" },
  "repairMs": 1,
  "immune": true,
  "candidates": [
    { "strategy": "refresh_nonce", "score": 87 },
    { "strategy": "remove_and_resubmit", "score": 64 }
  ]
}
```

Python, Go, Rust — anything that speaks HTTP.

---

## Docker

```bash
docker run -d -p 7842:7842 adrianhihi/helix-server
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│              User Objective              │
└───────────────┬─────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│     PCEC Engine (Perceive → Commit)     │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐  │
│  │Perceive │→│Construct │→│Evaluate │  │
│  │4-layer  │ │Gene Map  │ │Bayesian │  │
│  │classify │ │candidates│ │Q-value  │  │
│  └─────────┘ └──────────┘ └────┬────┘  │
│                                ↓        │
│                    ┌──────────────────┐  │
│                    │ Safety Verifier  │  │
│                    │ 7 constraints    │  │
│                    └────────┬─────────┘  │
│                             ↓            │
│                          ┌─────────┐    │
│                          │ Commit  │    │
│                          │execute  │    │
│                          │+verify  │    │
│                          │+learn   │    │
│                          └─────────┘    │
└───────────────┬─────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│            Gene Map (SQLite)            │
│  Bayesian Q-values × 6 dimensions      │
│  Causal repair graph                    │
│  Negative knowledge (anti-patterns)     │
│  Conditional genes + adaptive weights   │
└─────────────────────────────────────────┘
```

---

## Python SDK

```bash
pip install helix-agent-sdk
```

```python
from helix_agent import HelixClient

client = HelixClient(platform="coinbase")
result = client.repair("AA25 invalid account nonce")
print(f"Strategy: {result.strategy}, Immune: {result.immune}")
```

---

## Roadmap

- [x] PCEC engine + Gene Map core
- [x] 5 platform adapters (Coinbase, Tempo, Privy, Stripe, Generic)
- [x] REST API for cross-language integration
- [x] Failure learning + multi-dimensional scoring (6D)
- [x] Error embedding (28 signatures, fuzzy matching)
- [x] Gene Dream (background memory consolidation)
- [x] Causal Repair Graph + Negative Knowledge (Reflexion)
- [x] Meta-Learning + Conditional Genes (ExpeL)
- [x] Adversarial robustness (4-layer defense)
- [x] Formal Safety Verification (7 pre-execution constraints)
- [x] Self-Play Evolution (autonomous strategy improvement)
- [x] Federated Gene Learning (differential privacy)
- [x] Auto Strategy Generation (LLM + rule-based)
- [x] Adaptive Evaluate Weights (online learning)
- [x] Auto Adapter Discovery
- [x] Base mainnet validation — 100% diagnostic accuracy (32/32)
- [ ] Multi-Agent Coordination (shared Gene Map across agent fleets)
- [ ] PostgreSQL support (enterprise-grade deployment)
- [ ] Real-time Gene Telemetry Network (privacy-preserving, cross-org learning)
- [ ] Stripe deep integration
- [ ] Circle / USDC adapter
- [ ] Solana adapter

---

## Research Foundations

| Paper | Implementation |
|-------|----------------|
| Reflexion (2023) | Negative Knowledge — anti-pattern memory |
| ExpeL (2024) | Conditional Genes — context-aware scoring |
| Voyager (2023) | Auto Strategy Generation |
| MemRL (2026) | Gene Map Q-value scoring |
| SAGE (2025) | PCEC Verify stage |

---

## CLI

```bash
npx helix serve --port 7842 --mode observe   # Start REST API server
npx helix simulate "AA25 Invalid account nonce" # Dry-run diagnosis
npx helix scan ./src                          # Scan codebase for payment patterns
npx helix dream                               # Trigger Gene Dream
npx helix self-play 10                        # Run self-play evolution rounds
npx helix status                              # Gene Map health
```

---

## MCP Server

```bash
npx @helix-agent/mcp
```

Tools: `helix_diagnose` · `helix_repair` · `helix_gene_status` · `helix_check_immunity`

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT

---

<div align="center">

**Built by [Helix](https://github.com/adrianhihi)** · `npm install @helix-agent/core`

</div>
