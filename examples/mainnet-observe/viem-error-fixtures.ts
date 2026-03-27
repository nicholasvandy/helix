/**
 * Helix viem Error Fixtures
 *
 * Records real error objects from viem — the most common
 * Ethereum/Base client library. These are the actual errors
 * Helix sees when wrapping viem-based payment functions.
 *
 * Usage:
 *   npx tsx examples/mainnet-observe/viem-error-fixtures.ts
 */

import {
  NonceTooLowError,
  NonceTooHighError,
  InsufficientFundsError,
  IntrinsicGasTooLowError,
  IntrinsicGasTooHighError,
  FeeCapTooLowError,
  FeeCapTooHighError,
  ExecutionRevertedError,
  HttpRequestError,
  TimeoutError,
  LimitExceededRpcError,
  EstimateGasExecutionError,
  ContractFunctionRevertedError,
  ChainMismatchError,
  InvalidChainIdError,
  TransactionTypeNotSupportedError,
  InternalRpcError,
} from 'viem';

const HELIX_URL = process.env.HELIX_URL || 'http://localhost:7842';

// ── Diagnose ──────────────────────────────────────────────
async function diagnose(error: string, platform: string) {
  const res = await fetch(`${HELIX_URL}/repair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error, platform }),
  });
  return res.json();
}

// ── Test cases ────────────────────────────────────────────
const TEST_CASES: {
  name: string;
  makeError: () => Error;
  platform: string;
  expectedStrategy: string;
}[] = [
  // ── Nonce errors ──
  {
    name: 'NonceTooLowError',
    makeError: () => new NonceTooLowError({ nonce: 0, maxNonce: 47 }),
    platform: 'coinbase',
    expectedStrategy: 'refresh_nonce',
  },
  {
    name: 'NonceTooHighError',
    makeError: () => new NonceTooHighError({ nonce: 999, maxNonce: 47 }),
    platform: 'coinbase',
    expectedStrategy: 'refresh_nonce',
  },

  // ── Balance / funds errors ──
  {
    name: 'InsufficientFundsError',
    makeError: () => new InsufficientFundsError({
      account: { address: '0x1234567890123456789012345678901234567890', type: 'json-rpc' },
    }),
    platform: 'coinbase',
    expectedStrategy: 'reduce_request',
  },

  // ── Gas errors ──
  {
    name: 'IntrinsicGasTooLowError',
    makeError: () => new IntrinsicGasTooLowError({ gas: 1n, minimum: 21000n }),
    platform: 'coinbase',
    expectedStrategy: 'speed_up_transaction',
  },
  {
    name: 'IntrinsicGasTooHighError',
    makeError: () => new IntrinsicGasTooHighError({ gas: 99999999n, maximum: 30000000n }),
    platform: 'coinbase',
    expectedStrategy: 'speed_up_transaction',
  },
  {
    name: 'FeeCapTooLowError',
    makeError: () => new FeeCapTooLowError({ maxFeePerGas: 1n, baseFeePerGas: 1000000000n }),
    platform: 'coinbase',
    expectedStrategy: 'speed_up_transaction',
  },
  {
    name: 'FeeCapTooHighError',
    makeError: () => new FeeCapTooHighError({ maxFeePerGas: 999999999999999999n, maxFeePerGasCap: 1000000000n }),
    platform: 'coinbase',
    expectedStrategy: 'speed_up_transaction',
  },
  {
    name: 'EstimateGasExecutionError',
    makeError: () => new EstimateGasExecutionError(
      new Error('gas estimation failed'),
      { account: { address: '0x1234567890123456789012345678901234567890', type: 'json-rpc' } }
    ),
    platform: 'coinbase',
    expectedStrategy: 'speed_up_transaction',
  },

  // ── Execution revert ──
  {
    name: 'ExecutionRevertedError',
    makeError: () => new ExecutionRevertedError({ message: 'execution reverted', cause: undefined }),
    platform: 'coinbase',
    expectedStrategy: 'remove_and_resubmit',
  },
  {
    name: 'ContractFunctionRevertedError (insufficient balance)',
    makeError: () => new ContractFunctionRevertedError({
      abi: [],
      functionName: 'transfer',
      message: 'ERC20: transfer amount exceeds balance',
    }),
    platform: 'coinbase',
    expectedStrategy: 'reduce_request',
  },

  // ── Network / RPC errors ──
  {
    name: 'HttpRequestError (timeout)',
    makeError: () => new HttpRequestError({
      url: 'https://mainnet.base.org',
      status: 408,
      body: { error: 'Request timeout' },
    }),
    platform: 'coinbase',
    expectedStrategy: 'retry',
  },
  {
    name: 'TimeoutError',
    makeError: () => new TimeoutError({ body: {}, url: 'https://mainnet.base.org' }),
    platform: 'coinbase',
    expectedStrategy: 'retry',
  },
  {
    name: 'LimitExceededRpcError (rate limit)',
    makeError: () => new LimitExceededRpcError(
      new Error('Too many requests')
    ),
    platform: 'coinbase',
    expectedStrategy: 'backoff_retry',
  },
  {
    name: 'InternalRpcError',
    makeError: () => new InternalRpcError(
      new Error('Internal JSON-RPC error')
    ),
    platform: 'coinbase',
    expectedStrategy: 'retry',
  },

  // ── Chain / network errors ──
  {
    name: 'ChainMismatchError',
    makeError: () => new ChainMismatchError({ chain: { id: 1, name: 'Ethereum' } as any, currentChainId: 8453 }),
    platform: 'coinbase',
    expectedStrategy: 'switch_network',
  },
  {
    name: 'InvalidChainIdError',
    makeError: () => new InvalidChainIdError({ chainId: 9999 }),
    platform: 'coinbase',
    expectedStrategy: 'switch_network',
  },
];

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log('\nHelix viem Error Fixtures Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Helix:      ${HELIX_URL}`);
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log();

  try {
    await fetch(`${HELIX_URL}/health`);
  } catch {
    console.error('❌ Helix server not running.');
    process.exit(1);
  }

  // Print raw errors first
  console.log('── Raw viem Error Objects ──────────────────\n');
  const fixtures: { tc: typeof TEST_CASES[0]; err: Error }[] = [];

  for (const tc of TEST_CASES) {
    try {
      const err = tc.makeError();
      fixtures.push({ tc, err });
      console.log(`  [${err.name}]`);
      console.log(`  Message: ${err.message.substring(0, 120)}`);
      console.log(`  shortMessage: ${(err as any).shortMessage?.substring(0, 80) ?? 'none'}`);
      console.log();
    } catch (e: any) {
      console.warn(`  ⚠ Could not instantiate ${tc.name}: ${e.message}`);
    }
  }

  // Run through Helix
  console.log('── Helix Diagnosis ─────────────────────────\n');
  const results: { name: string; input: string; code: string; strategy: string; expected: string; pass: boolean }[] = [];

  for (const { tc, err } of fixtures) {
    // viem errors have both message and shortMessage — try both
    const input = (err as any).shortMessage || err.message;
    const d = await diagnose(input, tc.platform);
    const code = d?.failure?.code || 'unknown';
    const strategy = d?.strategy?.name || 'none';
    const pass = strategy === tc.expectedStrategy;

    results.push({ name: tc.name, input, code, strategy, expected: tc.expectedStrategy, pass });

    console.log(`  ${pass ? '✅' : '❌'} ${tc.name}`);
    console.log(`     Input:    "${input.substring(0, 80)}"`);
    console.log(`     Helix:    ${code} → ${strategy}`);
    if (!pass) console.log(`     Expected: ${tc.expectedStrategy}`);
    console.log();
  }

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const accuracy = ((passed / results.length) * 100).toFixed(1);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Results: ${passed}/${results.length} passed`);
  console.log(`Accuracy: ${accuracy}%`);

  if (failed > 0) {
    console.log('\nFailed:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  ❌ ${r.name}`);
      console.log(`     Input:    "${r.input.substring(0, 80)}"`);
      console.log(`     Got:      ${r.code} → ${r.strategy}`);
      console.log(`     Expected: ${r.expected}`);
    });
  }
}

main().catch(console.error);
