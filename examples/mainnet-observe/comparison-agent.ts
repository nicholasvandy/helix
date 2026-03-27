/**
 * Helix Before/After Comparison Agent
 *
 * Runs two agents alternately:
 * - Without Helix: errors = failed transactions
 * - With Helix: errors = auto-repaired transactions
 *
 * Change DURATION_MS for different run lengths:
 *   5 min test:  300_000
 *   24 hour run: 86_400_000
 *
 * Usage:
 *   export BASE_RPC_URL="..."
 *   export PRIVATE_KEY="0x..."
 *   export RECIPIENT="0x..."
 *   npx tsx examples/mainnet-observe/comparison-agent.ts
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { wrap } from '@helix-agent/core';
import * as fs from 'fs';

const RPC_URL = process.env.BASE_RPC_URL!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RECIPIENT = process.env.RECIPIENT!;

// ── Config ────────────────────────────────────────────────
const DURATION_MS = parseInt(process.env.DURATION_MS || '300000'); // 5 min default
const TX_INTERVAL_MS = parseInt(process.env.TX_INTERVAL_MS || '30000'); // 30s between txs
const ERROR_RATE = 0.6; // 60% of txs will have intentional errors

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

// ── Stats ─────────────────────────────────────────────────
const stats = {
  without: { attempts: 0, failed: 0, succeeded: 0, errors: [] as string[] },
  with: { attempts: 0, failed: 0, succeeded: 0, repaired: 0, txHashes: [] as string[], repairs: [] as { error: string; strategy: string; txHash: string; repairMs: number }[] },
};

// ── Error injection ───────────────────────────────────────
type ErrorType = 'nonce' | 'gas' | 'balance' | 'none';

function pickErrorType(): ErrorType {
  if (Math.random() > ERROR_RATE) return 'none';
  const types: ErrorType[] = ['nonce', 'gas', 'balance'];
  return types[Math.floor(Math.random() * types.length)];
}

async function buildTxParams(errorType: ErrorType) {
  const currentNonce = await publicClient.getTransactionCount({ address: account.address });
  const balance = await publicClient.getBalance({ address: account.address });

  switch (errorType) {
    case 'nonce':
      return {
        to: RECIPIENT as `0x${string}`,
        value: parseEther('0.000001'),
        nonce: Math.max(0, currentNonce - 1), // stale nonce
      };
    case 'gas':
      return {
        to: RECIPIENT as `0x${string}`,
        value: parseEther('0.000001'),
        gas: 1n, // way too low
      };
    case 'balance':
      return {
        to: RECIPIENT as `0x${string}`,
        value: (balance * 110n) / 100n, // 110% of balance
      };
    default:
      return {
        to: RECIPIENT as `0x${string}`,
        value: parseEther('0.000001'),
      };
  }
}

// ── Raw payment (no Helix) ────────────────────────────────
async function rawPayment(errorType: ErrorType) {
  stats.without.attempts++;
  const timestamp = new Date().toISOString();

  try {
    const params = await buildTxParams(errorType);
    const hash = await walletClient.sendTransaction(params);
    await publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 });
    stats.without.succeeded++;
    console.log(`  [WITHOUT] ✅ attempt #${stats.without.attempts} (${errorType}) → success`);
  } catch (e: any) {
    stats.without.failed++;
    const msg = e.shortMessage || e.message?.substring(0, 60) || 'unknown';
    stats.without.errors.push(`[${timestamp}] ${errorType}: ${msg}`);
    console.log(`  [WITHOUT] ❌ attempt #${stats.without.attempts} (${errorType}) → FAILED: ${msg}`);
  }
}

// ── Helix payment (with Helix) ────────────────────────────
async function helixPayment(errorType: ErrorType) {
  stats.with.attempts++;

  async function sendTx(params: any) {
    return walletClient.sendTransaction(params);
  }

  const safePay = wrap(sendTx, {
    mode: 'auto' as any,
    platform: 'coinbase',
    verbose: false,
  });

  try {
    const params = await buildTxParams(errorType);
    const start = Date.now();
    const result = await safePay(params);
    const repairMs = Date.now() - start;

    // wrap() returns Object.assign(result, {_helix}) — for strings this creates a String object
    const hash = String(result).startsWith('0x') ? String(result) : (result as any)?.hash || '';

    if (hash) {
      try {
        await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: 15_000 });
      } catch {}
    }

    stats.with.succeeded++;

    if (errorType !== 'none') {
      stats.with.repaired++;
      stats.with.repairs.push({
        error: errorType,
        strategy: 'auto-repaired',
        txHash: hash,
        repairMs,
      });
      stats.with.txHashes.push(hash);
      console.log(`  [WITH]    🔧 attempt #${stats.with.attempts} (${errorType}) → repaired in ${repairMs}ms → TX ${hash.substring(0, 10)}...`);
    } else {
      console.log(`  [WITH]    ✅ attempt #${stats.with.attempts} (${errorType}) → success`);
    }
  } catch (e: any) {
    stats.with.failed++;
    const msg = e.shortMessage || e.message?.substring(0, 60) || 'unknown';
    console.log(`  [WITH]    ❌ attempt #${stats.with.attempts} (${errorType}) → failed: ${msg}`);
  }
}

// ── Save log ──────────────────────────────────────────────
function saveLog() {
  const log = {
    timestamp: new Date().toISOString(),
    duration_ms: DURATION_MS,
    without_helix: {
      attempts: stats.without.attempts,
      succeeded: stats.without.succeeded,
      failed: stats.without.failed,
      failure_rate: `${((stats.without.failed / Math.max(stats.without.attempts, 1)) * 100).toFixed(1)}%`,
      errors: stats.without.errors,
    },
    with_helix: {
      attempts: stats.with.attempts,
      succeeded: stats.with.succeeded,
      failed: stats.with.failed,
      repaired: stats.with.repaired,
      repair_rate: `${((stats.with.repaired / Math.max(stats.with.failed + stats.with.repaired, 1)) * 100).toFixed(1)}%`,
      tx_hashes: stats.with.txHashes,
      repairs: stats.with.repairs,
    },
  };

  fs.writeFileSync('comparison-log.json', JSON.stringify(log, null, 2));
  return log;
}

// ── Print summary ─────────────────────────────────────────
function printSummary() {
  const log = saveLog();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RESULTS\n');
  console.log('  WITHOUT Helix:');
  console.log(`    Attempts:  ${log.without_helix.attempts}`);
  console.log(`    Succeeded: ${log.without_helix.succeeded}`);
  console.log(`    Failed:    ${log.without_helix.failed} (${log.without_helix.failure_rate})`);
  console.log();
  console.log('  WITH Helix:');
  console.log(`    Attempts:  ${log.with_helix.attempts}`);
  console.log(`    Succeeded: ${log.with_helix.succeeded}`);
  console.log(`    Repaired:  ${log.with_helix.repaired} (${log.with_helix.repair_rate})`);
  console.log(`    Failed:    ${log.with_helix.failed}`);
  console.log();

  if (log.with_helix.tx_hashes.length > 0) {
    console.log('  TX Hashes (repaired transactions):');
    log.with_helix.tx_hashes.slice(0, 5).forEach(h => {
      console.log(`    https://basescan.org/tx/${h}`);
    });
  }

  console.log();
  console.log('  Saved to comparison-log.json');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log('\nHelix Before/After Comparison Agent');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Wallet:    ${account.address}`);
  console.log(`Recipient: ${RECIPIENT}`);
  console.log(`Duration:  ${DURATION_MS / 60000} minutes`);
  console.log(`Interval:  ${TX_INTERVAL_MS / 1000}s between txs`);
  console.log(`Error rate: ${ERROR_RATE * 100}% of txs will have intentional errors`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance:   ${formatEther(balance)} ETH`);
  console.log();

  if (balance < parseEther('0.001')) {
    console.error('❌ Insufficient balance. Need at least 0.001 ETH.');
    process.exit(1);
  }

  const startTime = Date.now();
  let txCount = 0;

  console.log('Starting... (Ctrl+C to stop early)\n');

  // Save log on exit
  process.on('SIGINT', () => {
    console.log('\n\nStopped early.');
    printSummary();
    process.exit(0);
  });

  while (Date.now() - startTime < DURATION_MS) {
    txCount++;
    const errorType = pickErrorType();
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`\n[${elapsed}s] TX #${txCount} — error type: ${errorType}`);

    // Run both agents with same error type
    await rawPayment(errorType);
    await new Promise(r => setTimeout(r, 2000)); // 2s gap between the two
    await helixPayment(errorType);

    // Save log every iteration
    saveLog();

    // Wait for next interval
    const remaining = TX_INTERVAL_MS - (Date.now() - startTime) % TX_INTERVAL_MS;
    if (Date.now() - startTime + remaining < DURATION_MS) {
      console.log(`\n  Next tx in ${Math.round(remaining / 1000)}s...`);
      await new Promise(r => setTimeout(r, remaining));
    }
  }

  printSummary();
}

main().catch(console.error);
