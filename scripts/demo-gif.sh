#!/bin/bash
set -e
echo ""
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║  HELIX — Self-Healing Infrastructure Demo                ║"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo ""
sleep 1
echo "  → npx helix status"
npx tsx packages/core/src/cli.ts status
sleep 2
echo "  → npx helix simulate \"AA25 Invalid account nonce\""
npx tsx packages/core/src/cli.ts simulate "AA25 Invalid account nonce"
sleep 2
echo "  → npx helix simulate \"429 Too Many Requests\""
npx tsx packages/core/src/cli.ts simulate "429 Too Many Requests"
sleep 2
echo "  → npx helix gc"
npx tsx packages/core/src/cli.ts gc
sleep 1
echo ""
echo "  ✅ Demo complete. Helix heals."
echo ""
