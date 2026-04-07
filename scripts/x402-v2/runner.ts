/**
 * x402 Reliability Study v2 — Clean Design
 *
 * Fixes from v1 (Eric Brown / x402 team feedback):
 *  1. Sequential single submissions — no parallel fork
 *  2. CDP Server Wallet — not self-hosted PK
 *  3. estimateGas + 10% buffer, logged per tx
 *  4. Clean separation: rpc_error vs api_error vs tx_error
 *
 * Usage:
 *   npx tsx scripts/x402-v2/runner.ts raw 12      # 12h raw run
 *   npx tsx scripts/x402-v2/runner.ts helix 12    # 12h helix run
 *   npx tsx scripts/x402-v2/runner.ts raw 0.01    # quick test (~36s)
 */

import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

const TX_INTERVAL_MS = 180_000;
const TRANSFER_AMOUNT_ETH = '0.0001';
const RECIPIENT = process.env.RECIPIENT_ADDRESS || process.env.RECIPIENT || '0x0000000000000000000000000000000000000001';

function initCDP() {
  const name = process.env.CDP_API_KEY_NAME;
  const pk = process.env.CDP_API_KEY_PRIVATE_KEY;
  if (!name || !pk) throw new Error('Set CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY in .env');
  Coinbase.configure({ apiKeyName: name, privateKey: pk.replace(/\\n/g, '\n') });
}

interface ClassifiedError { code: string; source: 'rpc' | 'api' | 'tx' | 'unknown'; message: string; }

function classifyError(err: any): ClassifiedError {
  const msg = (err?.message || String(err)).toLowerCase();
  if (msg.includes('429') && msg.includes('alchemy')) return { code: 'rpc_rate_limit', source: 'rpc', message: err.message };
  if (msg.includes('could not detect network') || msg.includes('network error')) return { code: 'rpc_network_error', source: 'rpc', message: err.message };
  if (msg.includes('429')) return { code: 'api_rate_limit', source: 'api', message: err.message };
  if (msg.includes('402') || msg.includes('payment required')) return { code: 'api_payment_required', source: 'api', message: err.message };
  if (msg.includes('503') || msg.includes('502')) return { code: 'api_server_error', source: 'api', message: err.message };
  if (msg.includes('nonce') || msg.includes('replacement transaction')) return { code: 'tx_nonce_conflict', source: 'tx', message: err.message };
  if (msg.includes('insufficient fund') || msg.includes('insufficient balance')) return { code: 'tx_insufficient_funds', source: 'tx', message: err.message };
  if (msg.includes('gas') && msg.includes('low')) return { code: 'tx_gas_too_low', source: 'tx', message: err.message };
  if (msg.includes('underpriced')) return { code: 'tx_underpriced', source: 'tx', message: err.message };
  return { code: 'unknown', source: 'unknown', message: err.message || String(err) };
}

async function helixRepair(error: ClassifiedError, amount: string): Promise<{ repaired: boolean; strategy: string; newAmount?: string }> {
  switch (error.code) {
    case 'tx_nonce_conflict': return { repaired: true, strategy: 'cdp_nonce_managed' };
    case 'tx_gas_too_low': case 'tx_underpriced': return { repaired: true, strategy: 'cdp_gas_managed' };
    case 'api_rate_limit': case 'rpc_rate_limit': { const ms = 5000 + Math.random() * 5000; await new Promise(r => setTimeout(r, ms)); return { repaired: true, strategy: `exponential_backoff_${Math.round(ms)}ms` }; }
    case 'api_server_error': case 'rpc_network_error': { await new Promise(r => setTimeout(r, 3000)); return { repaired: true, strategy: 'backoff_retry' }; }
    case 'tx_insufficient_funds': return { repaired: true, strategy: 'reduce_amount', newAmount: (parseFloat(amount) * 0.9).toFixed(6) };
    default: return { repaired: false, strategy: 'no_repair_available' };
  }
}

interface TxResult {
  index: number; timestamp: string; mode: 'raw' | 'helix';
  gasEstimate: string | null; gasEstimatePlusBuffer: string | null;
  gasUsed: string | null; gasPrice: string | null; gasCostETH: string | null;
  success: boolean; txHash: string | null; basescanUrl: string | null;
  errorCode: string | null; errorSource: string | null; errorMessage: string | null;
  repaired: boolean; repairStrategy: string | null; attempts: number;
}

async function sendOneTx(wallet: any, provider: ethers.Provider, index: number, mode: 'raw' | 'helix', amount = TRANSFER_AMOUNT_ETH): Promise<TxResult> {
  const result: TxResult = { index, timestamp: new Date().toISOString(), mode, gasEstimate: null, gasEstimatePlusBuffer: null, gasUsed: null, gasPrice: null, gasCostETH: null, success: false, txHash: null, basescanUrl: null, errorCode: null, errorSource: null, errorMessage: null, repaired: false, repairStrategy: null, attempts: 0 };
  const MAX = mode === 'helix' ? 3 : 1;
  let amt = amount;

  for (let attempt = 1; attempt <= MAX; attempt++) {
    result.attempts = attempt;
    try {
      // Gas estimate
      try {
        const est = await provider.estimateGas({ to: RECIPIENT, value: ethers.parseEther(amt) });
        result.gasEstimate = est.toString();
        result.gasEstimatePlusBuffer = ((est * 110n) / 100n).toString();
      } catch {}

      // Send via CDP
      const transfer = await wallet.createTransfer({ amount: parseFloat(amt), assetId: Coinbase.assets.Eth, destination: RECIPIENT, gasless: false });
      await transfer.wait();
      const tx = transfer.getTransaction();
      result.txHash = tx?.getTransactionHash() ?? null;
      result.basescanUrl = result.txHash ? `https://basescan.org/tx/${result.txHash}` : null;

      // Receipt
      if (result.txHash) {
        try {
          const receipt = await provider.getTransactionReceipt(result.txHash);
          if (receipt) { result.gasUsed = receipt.gasUsed.toString(); result.gasPrice = receipt.gasPrice?.toString() ?? null; if (receipt.gasUsed && receipt.gasPrice) result.gasCostETH = ethers.formatEther(receipt.gasUsed * receipt.gasPrice); }
        } catch {}
      }
      result.success = true;
      break;
    } catch (err: any) {
      const c = classifyError(err);
      result.errorCode = c.code; result.errorSource = c.source; result.errorMessage = c.message?.slice(0, 200) ?? null;
      if (mode === 'helix' && attempt < MAX) {
        const repair = await helixRepair(c, amt);
        if (repair.repaired) { result.repaired = true; result.repairStrategy = repair.strategy; if (repair.newAmount) amt = repair.newAmount; continue; }
      }
      break;
    }
  }
  return result;
}

async function main() {
  initCDP();
  const mode = (process.argv[2] as 'raw' | 'helix') ?? 'raw';
  const hours = parseFloat(process.argv[3] ?? '12');
  const durationMs = hours * 3600000;

  console.log(`\nx402 Reliability Study v2\nMode: ${mode.toUpperCase()} | Duration: ${hours}h | Interval: ${TX_INTERVAL_MS / 1000}s\nExpected txs: ~${Math.floor(durationMs / TX_INTERVAL_MS)}\n`);

  // Persist wallet: create once → save seed, then reload on subsequent runs
  const seedFile = path.join(import.meta.dirname || '.', '../../x402-v2-results/wallet-seed.json');
  fs.mkdirSync(path.dirname(seedFile), { recursive: true });
  let wallet: InstanceType<typeof Wallet>;
  if (fs.existsSync(seedFile)) {
    const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    wallet = await Wallet.import(seedData);
    console.log('Loaded existing CDP wallet from seed file');
  } else {
    wallet = await Wallet.create({ networkId: 'base-mainnet' });
    const seedData = wallet.export();
    fs.writeFileSync(seedFile, JSON.stringify(seedData, null, 2));
    console.log(`Created new CDP wallet, seed saved to ${seedFile}`);
  }
  const addr = await wallet.getDefaultAddress();
  console.log(`CDP Wallet: ${addr.getId()}\nBaseScan: https://basescan.org/address/${addr.getId()}`);

  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
  const balance = await provider.getBalance(addr.getId());
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  if (balance < ethers.parseEther('0.01')) { console.error('Need >= 0.01 ETH. Fund the CDP wallet above.'); process.exit(1); }

  const outDir = path.join(import.meta.dirname || '.', '../../x402-v2-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `results-${mode}-${Date.now()}.json`);
  const results: TxResult[] = [];
  const start = Date.now();
  let idx = 0;

  while (Date.now() - start < durationMs) {
    idx++;
    const elapsed = ((Date.now() - start) / 60000).toFixed(1);
    console.log(`\n[${elapsed}min] TX #${idx} (${mode})...`);

    const r = await sendOneTx(wallet, provider, idx, mode);
    results.push(r);

    if (r.success) console.log(`  ✅ ${r.txHash?.slice(0, 20)}... gas: ${r.gasCostETH ?? '?'} ETH`);
    else { console.log(`  ❌ [${r.errorSource}] ${r.errorCode}: ${r.errorMessage?.slice(0, 80)}`); if (r.repaired) console.log(`  🔧 ${r.repairStrategy}`); }

    const ok = results.filter(r => r.success).length;
    console.log(`  Stats: ${ok}/${results.length} (${((ok / results.length) * 100).toFixed(1)}%)`);

    // Save
    const summary = {
      mode, totalTxs: results.length, succeeded: ok, failed: results.length - ok,
      repaired: results.filter(r => r.repaired && r.success).length,
      successRate: `${((ok / results.length) * 100).toFixed(1)}%`,
      errorBreakdown: results.filter(r => r.errorCode).reduce((a, r) => { if (r.errorCode) a[r.errorCode] = (a[r.errorCode] ?? 0) + 1; return a; }, {} as Record<string, number>),
      gasStats: {
        avgEstimate: results.filter(r => r.gasEstimate).reduce((s, r) => s + parseInt(r.gasEstimate!), 0) / (results.filter(r => r.gasEstimate).length || 1),
        avgGasUsed: results.filter(r => r.gasUsed).reduce((s, r) => s + parseInt(r.gasUsed!), 0) / (results.filter(r => r.gasUsed).length || 1),
      },
    };
    fs.writeFileSync(outFile, JSON.stringify({ summary, results, cdpWalletAddress: addr.getId() }, null, 2));

    if (Date.now() - start + TX_INTERVAL_MS < durationMs) await new Promise(r => setTimeout(r, TX_INTERVAL_MS));
    else break;
  }

  const ok = results.filter(r => r.success).length;
  console.log(`\n${'═'.repeat(60)}\nCOMPLETE: ${results.length} txs | ${ok} success | ${results.length - ok} fail | ${((ok / results.length) * 100).toFixed(1)}%\nResults: ${outFile}\n${'═'.repeat(60)}`);
}

main().catch(console.error);
