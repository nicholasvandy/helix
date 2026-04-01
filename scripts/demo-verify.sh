#!/bin/bash
# Helix Demo Verify — kill server, clean DB, rebuild, restart, test
# Usage: bash scripts/demo-verify.sh

set -e

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║  Helix Demo Verify                ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# 1. Kill existing server
echo "  [1/6] Killing existing server..."
lsof -ti:7842 | xargs kill -9 2>/dev/null || true
sleep 1

# 2. Clean all DB files
echo "  [2/6] Cleaning DB files..."
rm -f helix-genes.db helix-genes.db-shm helix-genes.db-wal
rm -f packages/core/helix-genes.db packages/core/helix-genes.db-shm packages/core/helix-genes.db-wal
find . -name "helix-genes.db*" -not -path "./node_modules/*" -delete 2>/dev/null || true

# 3. Build
echo "  [3/6] Building..."
npm run build 2>&1 | tail -1

# 4. Start server
echo "  [4/6] Starting server..."
node packages/core/dist/cli.js serve --port 7842 --mode observe > /dev/null 2>&1 &
SERVER_PID=$!
sleep 2

# Check server is running
if ! curl -s http://localhost:7842/health > /dev/null 2>&1; then
  echo "  ✗ Server failed to start"
  exit 1
fi
echo "  ✓ Server running (PID: $SERVER_PID)"

# 5. Run demo tests
echo "  [5/6] Running demo tests..."
echo ""

# Test 1: Nonce error
echo "  ── Test 1: Nonce mismatch (Coinbase) ──"
curl -s -X POST http://localhost:7842/repair \
  -H 'Content-Type: application/json' \
  -d '{"error": "nonce mismatch: expected 42 got 38", "platform": "coinbase"}' | jq '{code: .failure.code, category: .failure.category, platform: .failure.platform, strategy: .strategy.name, immune: .immune}'
echo ""

# Test 2: Gas error
echo "  ── Test 2: Gas too low (Coinbase) ──"
curl -s -X POST http://localhost:7842/repair \
  -H 'Content-Type: application/json' \
  -d '{"error": "gas estimation failed: intrinsic gas too low", "platform": "coinbase"}' | jq '{code: .failure.code, category: .failure.category, strategy: .strategy.name}'
echo ""

# Test 3: Rate limit
echo "  ── Test 3: Rate limit (Generic) ──"
curl -s -X POST http://localhost:7842/repair \
  -H 'Content-Type: application/json' \
  -d '{"error": "429 Too Many Requests", "platform": "generic"}' | jq '{code: .failure.code, category: .failure.category, strategy: .strategy.name}'
echo ""

# Test 4: Safety check
echo "  ── Test 4: Safety (modify recipient → blocked) ──"
curl -s -X POST http://localhost:7842/api/verify-safety \
  -H 'Content-Type: application/json' \
  -d '{"strategy":"fix_params","overrides":{"to":"0xevil"},"mode":"auto"}' | jq '{safe, violations}'
echo ""

# Test 5: Immune (same error twice)
echo "  ── Test 5: Immune (repeat nonce error) ──"
curl -s -X POST http://localhost:7842/repair \
  -H 'Content-Type: application/json' \
  -d '{"error": "nonce mismatch: expected 42 got 38", "platform": "coinbase"}' | jq '{immune: .immune, repairMs: .repairMs}'
echo ""

# Test 6: Gene count
echo "  ── Test 6: Gene Map stats ──"
GENES=$(curl -s http://localhost:7842/genes | jq '.genes | length')
echo "  Genes loaded: $GENES"
echo ""

# 6. Summary
echo "  ╔═══════════════════════════════════╗"
echo "  ║  All tests complete               ║"
echo "  ║  Server: http://localhost:7842     ║"
echo "  ║  Dashboard: /dashboard            ║"
echo "  ║  Kill: kill $SERVER_PID            ║"
echo "  ╚═══════════════════════════════════╝"
echo ""
