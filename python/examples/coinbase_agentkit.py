"""
Example: Helix + Coinbase AgentKit

Requires: pip install helix-agent
Requires: Helix server running (npx helix serve)
"""
from helix_agent import HelixClient, helix_wrap

client = HelixClient(platform="coinbase")

errors = [
    "AA25 invalid account nonce",
    "rate limit exceeded: 429",
    "insufficient USDC balance for 402 payment",
    "gas estimation failed: execution reverted",
    "paymaster signature verification failed",
]

print("=== Helix x Coinbase AgentKit Demo ===\n")

for error in errors:
    result = client.repair(error)
    status = "IMMUNE" if result.immune else f"-> {result.strategy}"
    print(f"  [{result.repair_time_ms:5.0f}ms] {status:30s} | {error[:50]}")

print("\n=== Second Pass (all IMMUNE) ===\n")

for error in errors:
    result = client.repair(error)
    status = "IMMUNE" if result.immune else f"-> {result.strategy}"
    print(f"  [{result.repair_time_ms:5.0f}ms] {status:30s} | {error[:50]}")

print(f"\n  Genes: {client.genes().get('total', '?')}")
print(f"  Health: {client.health().get('status', '?')}")
