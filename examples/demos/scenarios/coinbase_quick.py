"""
Coinbase quick demo — 2 minute version.
Usage: python3 examples/demos/run.py coinbase_quick
"""
import requests
import time

BASE = 'http://localhost:7842'


def repair(error, platform='coinbase', agent_id='quick-demo'):
    try:
        return requests.post(f'{BASE}/repair', json={
            'error': error, 'platform': platform, 'agentId': agent_id
        }, timeout=10).json()
    except Exception:
        return {'error': 'unreachable'}


def run():
    print()
    print('  \033[1;33mHelix \u00d7 Coinbase \u2014 2 Min Demo\033[0m')
    print()

    errors = [
        'AA25 invalid account nonce: expected 12, got 8',
        'CDP API rate_limit_exceeded (429)',
        'insufficient USDC token balance for 402 payment',
        'EXECUTION_REVERTED (-32521)',
        'paymaster signature verification failed',
    ]

    print('  \033[36m\u2460 Five Coinbase errors \u2192 diagnosed in <5ms:\033[0m')
    for e in errors:
        r = repair(e)
        s = (r.get('strategy') or {}).get('name', '?')
        print(f'    \U0001f527 {s:.<25} \u2190 {e[:45]}')
        time.sleep(0.2)

    print()
    print('  \033[36m\u2461 Same errors again \u2192 all IMMUNE:\033[0m')
    for e in errors:
        r = repair(e, agent_id='quick-2')
        im = '\u26a1' if r.get('immune') else '\U0001f527'
        s = (r.get('strategy') or {}).get('name', '?')
        print(f'    {im} {s:.<25} \u2190 {e[:45]}')
        time.sleep(0.15)

    print()
    print('  \033[36m\u2462 Integration:\033[0m')
    print('    pip install helix-agent-sdk')
    print('    docker run -d -p 7842:7842 adrianhihi/helix-server')
    print()
    print('  \033[1;32m  17 Coinbase patterns. 3 LLM points. Python native. Zero CDP changes.\033[0m')
    print()
