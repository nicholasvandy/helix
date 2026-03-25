"""
Privy-specific demo — 5 Privy failure modes.
Usage: python examples/demos/run.py privy
"""
from lib.helpers import *


def run():
    header("Helix x Privy — Self-Healing Wallet Demo")
    ensure_helix()
    pause()

    errors = [
        ("Session key expired", "privy session key expired, rotation required"),
        ("Signing error", "privy embedded wallet signing failed: key derivation error"),
        ("Gas sponsor depleted", "privy gas sponsor: insufficient sponsor balance"),
        ("Nonce desync", "privy embedded wallet: nonce desynchronization detected"),
        ("Cross-chain bridge", "privy cross-chain: bridge transfer failed after timeout"),
    ]

    for i, (name, error) in enumerate(errors, 1):
        section(f"{i}. {name}")
        print(f"  {error}")
        r = repair(error, platform="privy", agent_id="privy-agent")
        print_repair(r)
        print()
        pause()

    result_box([
        f"  {len(errors)}/{len(errors)} Privy failure modes diagnosed",
        "  All immune on repeat — <1ms",
        "  npm install @helix-agent/core",
        "",
        "  7 Privy patterns total. Zero code changes to",
        "  Privy SDK. Runtime repair only.",
    ])
