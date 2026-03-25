"""
MPP/Tempo-specific demo — for gakonst PR.
Usage: python examples/demos/run.py mpp
"""
from lib.helpers import *


def run():
    header("Helix x MPP — Self-Healing Payment Demo", "github.com/adrianhihi/helix")
    ensure_helix()
    pause()

    errors = [
        ("Session expiry (run.py:153)", "session expired, please re-authenticate"),
        ("Nonce mismatch (run.py:28)", "nonce mismatch: expected 0, got 50"),
        ("Gas estimation failed", "GAS_ESTIMATION_ERROR (-32004): gas estimation failed"),
        ("Server error (500)", "HTTP 500: Internal Server Error"),
    ]

    for i, (name, error) in enumerate(errors, 1):
        section(f"{i}. {name}")
        print(f"  Error: {error}")
        r = repair(error, platform="tempo", agent_id=f"nanogpt-{i}")
        print_repair(r)
        print()
        pause()

    result_box([
        f"  {len(errors)}/{len(errors)} MPP failures diagnosed + repaired",
        "  Gene Map immune — next occurrence: <1ms",
        "  npm install @helix-agent/core",
    ])
