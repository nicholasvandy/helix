#!/usr/bin/env python3
"""
Helix Demo Runner

Usage:
    python examples/demos/run.py general   # All platforms
    python examples/demos/run.py privy     # Privy-specific
    python examples/demos/run.py mpp       # MPP/Tempo-specific
    python examples/demos/run.py v17       # v1.7 features
    python examples/demos/run.py all       # Run all demos

Requires:
    - pip install requests
    - Helix sidecar running: node packages/core/dist/cli.js serve --port 7842 --mode observe
"""
import sys
import os

# Add demos dir to path so scenarios can import lib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCENARIOS = {
    "general": "scenarios.general",
    "privy": "scenarios.privy",
    "mpp": "scenarios.mpp",
    "v17": "scenarios.v17",
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        print("Available scenarios:", ", ".join(SCENARIOS.keys()), "+ all")
        return

    target = sys.argv[1].lower()

    if target == "all":
        for name, module_path in SCENARIOS.items():
            print(f"\n{'='*60}")
            print(f"  Running: {name}")
            print(f"{'='*60}")
            mod = __import__(module_path, fromlist=["run"])
            mod.run()
    elif target in SCENARIOS:
        mod = __import__(SCENARIOS[target], fromlist=["run"])
        mod.run()
    else:
        print(f"Unknown scenario: {target}")
        print("Available:", ", ".join(SCENARIOS.keys()), "+ all")
        sys.exit(1)


if __name__ == "__main__":
    main()
