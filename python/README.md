# helix-agent

Python SDK for [Helix](https://github.com/adrianhihi/helix) — self-healing infrastructure for AI agent payments.

## Install

```bash
pip install helix-agent
```

Requires a running Helix server:

```bash
npm install -g @helix-agent/core
npx helix serve --port 7842
```

## Quick Start

### Method 1: Client

```python
from helix_agent import HelixClient

client = HelixClient(platform="coinbase")
result = client.repair("AA25 invalid account nonce")
print(f"Strategy: {result.strategy}")  # refresh_nonce
print(f"Immune: {result.immune}")      # True on 2nd call
```

### Method 2: Decorator

```python
from helix_agent import helix_wrap

@helix_wrap(platform="coinbase", max_retries=3)
def send_payment(to: str, amount: float):
    return agent.transfer(to, amount)

result = send_payment("0x...", 1.5)
```

### Method 3: Context Manager

```python
from helix_agent import helix_guard

with helix_guard("tempo") as guard:
    try:
        result = agent.transfer(to, amount)
    except Exception as e:
        repair = guard.repair(str(e))
        if repair.immune:
            result = agent.transfer(to, amount)
```

## Configuration

```python
HELIX_URL=http://localhost:7842  # env var

client = HelixClient(
    base_url="http://localhost:7842",
    platform="coinbase",
    agent_id="my-agent-1",
)
```

## Supported Platforms

- `tempo` — Tempo L1 blockchain
- `privy` — Privy embedded wallets
- `coinbase` — Coinbase CDP + AgentKit
- `generic` — Any HTTP/RPC service
