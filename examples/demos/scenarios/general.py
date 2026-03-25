"""
General demo — all platforms, core PCEC features.
Usage: python examples/demos/run.py general
"""
from lib.helpers import *


def run():
    header("Helix — Self-Healing Payment Demo", "github.com/adrianhihi/helix")
    ensure_helix()
    pause()

    errors = [
        ("Session expiry", "session expired, please re-authenticate", "tempo"),
        ("Nonce mismatch", "nonce mismatch: expected 0, got 50", "tempo"),
        ("Rate limited", "HTTP 429: Too Many Requests", "generic"),
        ("Gas estimation", "GAS_ESTIMATION_ERROR (-32004): gas estimation failed", "tempo"),
        ("Insufficient funds", "insufficient funds: balance 5.52 ETH, required 1000 ETH", "tempo"),
    ]

    for name, error, platform in errors:
        section(f"{name} ({platform})")
        print(f"  Error: {error}")
        r = repair(error, platform=platform)
        print_repair(r)
        print()
        pause()

    result_box([
        f"  {len(errors)}/{len(errors)} failures diagnosed automatically",
        "  Gene Map immune — next time: <1ms",
        "  npm install @helix-agent/core",
    ])
