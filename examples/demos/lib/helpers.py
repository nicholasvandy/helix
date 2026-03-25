"""
Shared helpers for Helix demo scripts.
"""
import requests
import json
import time
import sys

HELIX_URL = "http://localhost:7842"


def check_helix():
    """Check if Helix sidecar is running."""
    try:
        r = requests.get(f"{HELIX_URL}/health", timeout=2)
        return r.status_code == 200
    except Exception:
        return False


def repair(error, platform="tempo", agent_id="demo-agent"):
    """Send error to Helix for repair."""
    r = requests.post(f"{HELIX_URL}/repair", json={
        "error": error,
        "platform": platform,
        "agentId": agent_id,
    }, timeout=5)
    return r.json()


def get_genes():
    """Get all genes from Gene Map."""
    r = requests.get(f"{HELIX_URL}/genes", timeout=5)
    return r.json()


def get_status():
    """Get Helix status."""
    r = requests.get(f"{HELIX_URL}/status", timeout=5)
    return r.json()


def header(title, subtitle=None):
    """Print branded header box."""
    width = max(len(title) + 6, 54)
    print()
    print(f"  \u2554{'═' * width}\u2557")
    print(f"  \u2551  {title}{' ' * (width - len(title) - 2)}\u2551")
    if subtitle:
        print(f"  \u2551  {subtitle}{' ' * (width - len(subtitle) - 2)}\u2551")
    print(f"  \u255a{'═' * width}\u255d")
    print()


def section(title):
    """Print section divider."""
    print(f"\u2501\u2501\u2501 {title} \u2501\u2501\u2501")


def result_box(lines):
    """Print result summary box."""
    width = max(len(l) for l in lines) + 4
    print()
    print(f"  \u250c{'\u2500' * width}\u2510")
    for line in lines:
        print(f"  \u2502  {line}{' ' * (width - len(line) - 2)}\u2502")
    print(f"  \u2514{'\u2500' * width}\u2518")
    print()


def pause(seconds=1):
    """Pause for readability."""
    time.sleep(seconds)


def print_repair(r):
    """Pretty print a repair result."""
    failure = r.get("failure", {})
    strategy = r.get("strategy", {})
    immune = r.get("immune", False)
    ms = r.get("repairMs", 0)
    scores = r.get("scores", {})

    icon = "\u26a1 IMMUNE" if immune else "\u2705 REPAIRED"
    strat_name = strategy.get("name", "none") if strategy else "none"

    print(f"  \u2192 {icon} via {strat_name} ({ms}ms)")
    print(f"    Diagnosed: {failure.get('code', '?')} ({failure.get('category', '?')})")
    if scores:
        print(f"    Scores: {json.dumps(scores)}")


def ensure_helix():
    """Check Helix is running, exit if not."""
    if not check_helix():
        print("  \u274c Helix sidecar not running!")
        print("  Start it with:")
        print("    cd ~/Projects/helix")
        print("    node packages/core/dist/cli.js serve --port 7842 --mode observe")
        sys.exit(1)

    status = get_status()
    print(f"  [helix] Status: running")
    print(f"  [helix] Gene Map: {status.get('geneCount', '?')} genes")
    print(f"  [helix] Mode: {status.get('mode', '?')}")
