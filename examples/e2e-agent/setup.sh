#!/bin/bash
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  HELIX E2E Test Agent Setup                               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

KEY=$(node -e "const { generatePrivateKey } = require('viem/accounts'); console.log(generatePrivateKey())")
ADDRESS=$(node -e "const { privateKeyToAccount } = require('viem/accounts'); console.log(privateKeyToAccount('$KEY').address)")

echo "  Generated fresh test wallet:"
echo "  Private Key: $KEY"
echo "  Address:     $ADDRESS"
echo ""
echo "  ⚠️  TESTNET ONLY. Never use on mainnet."
echo ""
echo "  Next steps:"
echo "  1. Fund with testnet ETH:"
echo "     https://www.alchemy.com/faucets/base-sepolia"
echo "     (paste: $ADDRESS)"
echo ""
echo "  2. Run E2E test:"
echo "     AGENT_KEY=$KEY npx tsx examples/e2e-agent/agent.ts"
echo ""
echo "  3. Watch on Etherscan:"
echo "     https://sepolia.basescan.org/address/$ADDRESS"
echo ""

echo "AGENT_KEY=$KEY" > examples/e2e-agent/.env.test
echo "AGENT_ADDRESS=$ADDRESS" >> examples/e2e-agent/.env.test
echo "  Saved to examples/e2e-agent/.env.test"
