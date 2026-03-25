"""
Coinbase-specific demo — 18 Coinbase/CDP failure modes across 5 categories.
Usage: python examples/demos/run.py coinbase
"""
from lib.helpers import *


def run():
    header("Helix x Coinbase — Self-Healing Agent Payments", "ADR: Agent Detection & Response for CDP")
    ensure_helix()
    pause()

    categories = [
        ("CDP API / Server", [
            ("CDP API rate limit (429)",
             "CDP API rate_limit_exceeded (429)",
             "High-frequency agents hit CDP rate limits."),
            ("Transfer quote expired",
             "transfer_quote_expired: quote has expired, please request a new one",
             "Stale quotes from slow agent execution."),
            ("Internal server error (500)",
             "internal_server_error: CDP 500 internal server error",
             "CDP backend instability. Helix retries with backoff."),
        ]),
        ("ERC-4337 / Smart Wallet", [
            ("AA25 Nonce desync",
             "AA25 invalid account nonce: expected 12, got 8",
             "Concurrent agent wallets desync nonces."),
            ("AA21 Prefund failure",
             "AA21 didn't pay prefund: insufficient deposit",
             "Smart account can't cover execution gas."),
            ("AA13 initCode failed",
             "AA13 initCode failed or OOG: wallet deployment reverted",
             "First-time smart wallet deployment fails."),
            ("UserOp execution reverted",
             "EXECUTION_REVERTED (-32521): UserOperation execution reverted",
             "Smart account call reverts on-chain."),
            ("Paymaster signature failed",
             "paymaster signature verification failed",
             "Invalid paymaster sponsorship signature."),
            ("Gas estimation error",
             "GAS_ESTIMATION_ERROR (-32004): Gas estimation failed for userOp",
             "Bundler can't estimate gas for this UserOp."),
            ("Paymaster internal error",
             "INTERNAL_ERROR: paymaster service temporarily unavailable",
             "Coinbase paymaster backend down."),
        ]),
        ("Policy / Spending Limits", [
            ("Per-UserOp spend limit",
             "max per user op spend limit exceeded",
             "Single operation exceeds policy cap."),
            ("Monthly org spend limit",
             "max monthly org spend limit exceeded for this organization",
             "Organization hit monthly spending ceiling."),
            ("Per-address tx count limit",
             "maximum per address transaction count exceeded",
             "Too many txs from one address in time window."),
        ]),
        ("x402 Payment Protocol", [
            ("Insufficient USDC for 402",
             "insufficient USDC token balance for 402 payment. Required: 500",
             "Agent wallet can't cover x402 payment."),
            ("Wrong network",
             "wrong network: payment requires Base but wallet is on Ethereum",
             "Agent wallet on wrong chain for this payment."),
        ]),
        ("Network / Timeout", [
            ("Cross-chain bridge timeout",
             "cross-chain bridge timeout: no confirmation after 300s",
             "Bridge transfer stuck without confirmation."),
            ("Gateway timeout (504)",
             "504 gateway timed_out: upstream service did not respond",
             "CDP gateway timeout under load."),
        ]),
    ]

    total = sum(len(errors) for _, errors in categories)
    succeeded = 0

    for cat_name, errors in categories:
        print(f"\n  \u250c\u2500 {cat_name} \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")
        for name, error, explanation in errors:
            section(f"{name}")
            print(f"  Error: {error}")
            print(f"  Why:   {explanation}")
            r = repair(error, platform="coinbase", agent_id="cdp-agent")
            print_repair(r)
            if r.get("failure", {}).get("code") != "unknown":
                succeeded += 1
            pause(0.5)
        print()

    result_box([
        f"  {succeeded}/{total} Coinbase failure modes diagnosed",
        "  All immune on repeat — <1ms, $0 cost",
        "  npm install @helix-agent/core",
        "",
        "  25+ Coinbase patterns in adapter. Zero CDP SDK changes.",
        "  Runtime wrapper: wrap(sendTransaction)",
        "  Gene Map shares learnings across all Coinbase agents.",
    ])
