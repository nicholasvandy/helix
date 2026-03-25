"""
v1.7 features demo — failure learning + multi-dimensional scoring.
Usage: python examples/demos/run.py v17
"""
from lib.helpers import *
import json as jsonlib


def run():
    header("Helix v1.7 — Failure Learning + Scoring Demo")
    ensure_helix()
    pause()

    # 1. Multi-dimensional scoring
    section("1. Multi-Dimensional Scoring")
    r = repair("session expired, please re-authenticate", platform="tempo")
    print(f"  Diagnosis: {r['failure']['code']} ({r['failure']['category']})")
    strat = r.get("strategy")
    print(f"  Strategy:  {strat['name'] if strat else 'none'}")
    print(f"  Immune:    {r['immune']}")
    scores = r.get("scores", {})
    if scores:
        print(f"  Scores:")
        for k, v in scores.items():
            if isinstance(v, (int, float)):
                bar = "\u2588" * int(v * 20)
                print(f"    {k:20s} {bar} {v:.2f}")
    else:
        print(f"  Scores: (accumulating after repairs)")
    print()
    pause()

    # 2. Current Gene Map
    section("2. Current Gene Map")
    genes = get_genes()
    print(f"  Total genes: {genes['total']}")
    for g in genes["genes"][:5]:
        print(f"  \u2192 {g['strategy']:20s} Q={g['qValue']:.2f}  platforms={g.get('platforms', [])}")
    print()
    pause()

    # 3. Failure learning simulation
    section("3. Failure Learning — repeated failures trigger defensive Gene")
    print("  Simulating 6 identical failures...")
    for i in range(6):
        r = repair(
            "nonce mismatch: expected 0, got 50",
            platform="tempo",
            agent_id=f"fail-test-{i}",
        )
        status = "\u26a1 IMMUNE" if r.get("immune") else "\ud83d\udd27 REPAIR"
        strat = r["strategy"]["name"] if r.get("strategy") else "none"
        print(f"  Attempt {i+1}: {status} via {strat}")
        pause(0.3)
    print()
    pause()

    # 4. Check genes
    section("4. Gene Map Status")
    genes = get_genes()
    print(f"  Total genes: {genes['total']}")
    low_q = sum(1 for g in genes["genes"] if g.get("qValue", 1) < 0.4)
    if low_q > 0:
        print(f"  \ud83d\udee1\ufe0f {low_q} low-Q genes detected (failure learning active)")
    else:
        print(f"  Gene Map healthy — all strategies performing well")
    print()

    result_box([
        "  Multi-dimensional scoring: 6 dimensions",
        "  Failure learning: auto-distill after 5 failures",
        "  npm install @helix-agent/core@1.7.1",
    ])
