#!/bin/bash
# Start the data capture proxy.
# After starting, set: export ANTHROPIC_BASE_URL=http://localhost:9842

set -e
cd "$(dirname "$0")/.."

echo "Starting Helix data proxy..."
npx tsx scripts/proxy.ts "$@"
