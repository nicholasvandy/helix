# Helix — Agent Payment Intelligence

> Predict costs. Optimize execution. Fix failures. Learn forever.
>
> Powered by [VialOS Runtime](https://github.com/adrianhihi/vialos-runtime)

[![npm](https://img.shields.io/npm/v/@helix-agent/core)](https://www.npmjs.com/package/@helix-agent/core)
[![tests](https://img.shields.io/badge/tests-526%20passing-brightgreen)]()
[![GitHub stars](https://img.shields.io/github/stars/adrianhihi/helix)](https://github.com/adrianhihi/helix/stargazers)
[![license](https://img.shields.io/badge/license-MIT-blue)]()
[![PyPI](https://img.shields.io/pypi/v/helix-agent-sdk?color=3776AB)](https://pypi.org/project/helix-agent-sdk/)

Helix is the first vertical product of VialOS — an AI agent operating system. It brings self-evolving payment intelligence to autonomous agents: not just fixing failures, but predicting costs, optimizing execution, and learning from every transaction.

## Why Helix?

AI agents making payments fail ~5% of the time. That sounds low — until your agent runs 1,000 transactions a day. Helix turns every failure into immunity and every success into intelligence.

- **Reactive Repair** (v2, now): Transaction fails → PCEC engine diagnoses → Gene Map finds best fix → repairs automatically
- **Budget Intelligence** (v3, coming): Before sending a transaction, know exactly what it will cost based on historical data
- **Proactive Optimization** (v4, planned): Auto-select optimal gas, RPC, and timing from Gene Map history
- **Predictive Prevention** (v5, vision): Detect execution patterns → predict failures → intervene before they happen

## Quick Start

```bash
npm install @helix-agent/core
```

> **Do NOT use `npm install helix`** — that installs a different third-party package. Always use `@helix-agent/core`.

### Start the server

```bash
npx @helix-agent/core serve --port 7842 --mode observe
```

### Send a repair request

```bash
curl -X POST http://localhost:7842/repair \
  -H 'Content-Type: application/json' \
  -d '{"error": "nonce mismatch: expected 42 got 38", "platform": "coinbase"}'
```

### Python SDK

```bash
pip install helix-agent-sdk
```

```python
from helix_agent import HelixClient

client = HelixClient("http://localhost:7842")
result = client.repair("nonce mismatch: expected 42 got 38", platform="coinbase")
```

### Docker

```bash
docker run -d -p 7842:7842 adrianhihi/helix-server
```

## How It Works — PCEC Engine

Helix uses a 6-stage self-repair loop inspired by biological immune systems:

```
Perceive → Construct → Evaluate → Commit → Verify → Gene

Perceive:  5 layers of matching (string → embedding → meta-learner → LLM → safe default)
Construct: Gene Map lookup + Q-value ranking
Evaluate:  6-dimension scoring × adaptive weights × conditional genes
Commit:    Safety verification (7 constraints) → execute repair
Verify:    Confirm success or record anti-pattern
Gene:      Store in Gene Map → update causal graph → adapt weights
```

Every repair makes the next one smarter. The Gene Map accumulates repair strategies with Q-values (success rates), so Helix gets better the longer it runs.

## Platform Support

| Platform | Patterns | Coverage |
|----------|----------|----------|
| Coinbase (CDP + AgentKit) | 17 | ERC-4337, x402, Paymaster, Policy |
| Tempo | 13 | Nonce, Session, DEX, MPP, Network |
| Privy | 7 | Policy, Gas, Cross-chain, Embedded Wallet |
| Generic HTTP/API | 21 | Throttle, Server, Timeout, Auth, Client, Data |
| Generic Blockchain | 3 | 429, 500, Timeout |

## Advanced Features (v2.6.0)

| Feature | Description | Source |
|---------|-------------|--------|
| Self-Refine | Iterative failure refinement loop | arXiv 2303.17651 |
| Prompt Optimizer | DSPy-style prompt self-optimization | arXiv 2310.03714 |
| Causal Repair Graph | Track cause-effect between failures | Reflexion |
| Negative Knowledge | Learn what NOT to do | Reflexion |
| Meta-Learning | Few-shot pattern matching across errors | ExpeL |
| Conditional Genes | Context-dependent repair strategies | ExpeL |
| Safety Verifier | 7 pre-execution constraints | TrustAgent |
| Adversarial Defense | 4-layer robustness | AGrail |
| Self-Play | Challenger/repair/verifier evolution | — |
| Federated Learning | Privacy-preserving cross-agent learning | Differential privacy RL |
| Auto Strategy | LLM + rule-based strategy generation | Voyager |
| Adaptive Weights | Online learning for evaluate dimensions | — |
| Auto Adapter Discovery | Detect new error patterns automatically | — |
| Gene Dream | Background knowledge consolidation | Mem0 |

## VialOS Runtime Integration (Beta)

Helix is powered by the VialOS Runtime — a generic self-healing framework for autonomous agents. To enable VialOS features:

```bash
npx @helix-agent/core serve --port 7842 --mode observe --beta
```

Beta features:
- `GET /vial/status` — VialOS runtime information (13 modules, 5 adapters)
- VialOS metadata in `GET /health` response
- "Powered by VialOS Runtime" dashboard badge

Without `--beta`, Helix behaves identically to the stable release.

## REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/repair` | POST | Diagnose + repair |
| `/heal` | POST | MPP-payable repair (x402) |
| `/health` | GET | Server health |
| `/status` | GET | Gene Map stats |
| `/genes` | GET | List all genes |
| `/dashboard` | GET | Interactive HTML dashboard |
| `/dashboard/evolution-tree` | GET | Phylogenetic tree visualization |
| `/dream` | POST | Gene Dream consolidation |
| `/api/gene-scores` | GET | 6-dimension scores |
| `/api/causal-graph` | GET | Full causal graph |
| `/api/self-play` | POST | Run self-play rounds |
| `/api/prompt-stats` | GET | LLM classification accuracy |
| `/vial/status` | GET | VialOS runtime info (beta) |

## Architecture

```
Your Agent
    ↓
@helix-agent/core          ← Helix: payment adapters + REST API
    ↓
VialOS Runtime             ← PCEC + Gene Map + Gene Dream + learning modules
    ↓
LLM (Claude/GPT)           ← model-agnostic, swappable
```

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| `@helix-agent/core` | Payment intelligence SDK | `npm i @helix-agent/core` |
| `@vial-agent/core` | Generic self-healing framework | `npm i @vial-agent/core` |
| `@vial-agent/adapter-api` | HTTP/API error patterns (22) | `npm i @vial-agent/adapter-api` |
| `@vial-agent/runtime` | VialOS Runtime | `npm i @vial-agent/runtime` |
| `helix-agent-sdk` | Python SDK | `pip install helix-agent-sdk` |

## Stats

```
Tests:     526 passing (55 test files)
Schema:    v12 (auto-migrating SQLite)
Platforms: 5 (Coinbase, Tempo, Privy, Generic, API)
Patterns:  61 total error patterns
Papers:    8 research papers implemented
```

## License

MIT
