---
name: vial-self-healing
description: Vial self-healing hook v0.3 — gateway-layer error interception, loop detection, and agent role enforcement. Zero external API dependency.
version: 0.3.0
author: vial.ai
homepage: https://github.com/adrianhihi/helix
metadata: { "openclaw": { "emoji": "🔧", "events": ["after_tool_call", "agent:turn:complete", "agent:bootstrap"] } }
---

# Vial Self-Healing Hook v0.3

Gateway-layer enforcement. Unlike SKILL.md (suggestions), this hook runs as code.

## Covers
- Protocol 1: Loop detection (2+ text-only turns → inject interrupt)
- Protocol 3: Rate limit (429 → inject retry instruction)
- Protocol 4: Auth error (401/403 → inject repair instruction)
- Protocol 5: Timeout (→ inject retry instruction)
- Protocol 8: Role enforcement (orchestrator using forbidden tools → inject delegation)

## Install
```
openclaw plugins install @vial-agent/openclaw-hook
```

## Injection method
Uses `openclaw agent --message` — no external API, no Clawdi webhook needed.
