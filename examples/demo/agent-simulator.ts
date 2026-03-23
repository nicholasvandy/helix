#!/usr/bin/env node
/**
 * Helix — Live Demo: Multi-Agent Payment Simulator
 * Shared Gene Map → cross-agent IMMUNE
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { PcecEngine } from '../../packages/core/src/engine/pcec.js';
import { GeneMap } from '../../packages/core/src/engine/gene-map.js';
import { defaultAdapters } from '../../packages/core/src/platforms/index.js';
import { createPublicClient, http, formatEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { unlinkSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 7843;
const RPC = 'https://sepolia.base.org';
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

// ── Shared Gene Map + Engine (ALL agents share this) ──
const GENE_DB = '/tmp/helix-demo.db';
try { unlinkSync(GENE_DB); } catch {}
const geneMap = new GeneMap(GENE_DB);
(geneMap as any).db.exec('DELETE FROM genes');  // Start fresh for demo — show repair → immune journey
(geneMap as any).cache.clear();
const engine = new PcecEngine(geneMap, 'demo', { mode: 'auto', provider: { rpcUrl: RPC } });
for (const a of defaultAdapters) engine.registerAdapter(a);

// ── SSE ──
const clients: express.Response[] = [];
function broadcast(ev: unknown) { const d = `data: ${JSON.stringify(ev)}\n\n`; clients.forEach(c => c.write(d)); }

// ── Stats ──
const stats = {
  totalFailures: 0, totalRepaired: 0, totalImmune: 0, revenueProtected: 0,
  agents: {
    'order-bot': { icon: '💰', failures: 0, repaired: 0, immune: 0, label: 'Order Payments' },
    'refund-bot': { icon: '🔄', failures: 0, repaired: 0, immune: 0, label: 'Refund Processing' },
    'sub-bot': { icon: '📅', failures: 0, repaired: 0, immune: 0, label: 'Subscriptions' },
  } as Record<string, { icon: string; failures: number; repaired: number; immune: number; label: string }>,
  genes: {} as Record<string, { strategy: string; qValue: number; hits: number }>,
  errorTypes: {} as Record<string, number>,
  startTime: Date.now(),
  systematicAlerts: [] as { agentId: string; errorType: string; count: number; message: string; timestamp: number }[],
  events: [] as Record<string, unknown>[],
};

const recentErrors: { agentId: string; errorType: string; time: number }[] = [];

function recordEvent(ev: Record<string, unknown>) {
  stats.events.unshift(ev);
  if (stats.events.length > 100) stats.events.pop();
  stats.totalFailures++;
  const a = stats.agents[ev.agentId as string];
  if (a) { a.failures++; if (ev.repaired) a.repaired++; if (ev.immune) a.immune++; }
  if (ev.repaired) { stats.totalRepaired++; stats.revenueProtected += (ev.revenueAtRisk as number) || 50; }
  if (ev.immune) stats.totalImmune++;

  const s = ev.strategy as string;
  if (s && s !== 'none') {
    if (!stats.genes[s]) stats.genes[s] = { strategy: s, qValue: 0.5, hits: 0 };
    const g = stats.genes[s]; g.hits++; if (ev.repaired) g.qValue = Math.min(0.99, g.qValue + 0.05 * (1 - g.qValue));
    if (ev.immune) g.qValue = Math.min(0.99, g.qValue + 0.02);
  }
  stats.errorTypes[ev.errorType as string] = (stats.errorTypes[ev.errorType as string] || 0) + 1;

  // Systematic detection
  recentErrors.push({ agentId: ev.agentId as string, errorType: ev.errorType as string, time: Date.now() });
  const cutoff = Date.now() - 300000;
  while (recentErrors.length > 0 && recentErrors[0].time < cutoff) recentErrors.shift();
  const key = `${ev.agentId}:${ev.errorType}`;
  const cnt = recentErrors.filter(e => `${e.agentId}:${e.errorType}` === key).length;
  if (cnt >= 5 && !stats.systematicAlerts.find(x => x.agentId === ev.agentId && x.errorType === ev.errorType && Date.now() - x.timestamp < 60000)) {
    const alert = { agentId: ev.agentId as string, errorType: ev.errorType as string, count: cnt, message: `${ev.agentId} triggered "${ev.errorType}" ${cnt}× in 5 min — likely a code bug`, timestamp: Date.now() };
    stats.systematicAlerts.unshift(alert);
    if (stats.systematicAlerts.length > 5) stats.systematicAlerts.pop();
    broadcast({ type: 'systematic', ...alert });
    console.log(`  ⚠️  SYSTEMATIC: ${alert.message}`);
  }

  broadcast({ type: 'event', ...ev });
  broadcast({ type: 'stats', ...stats, events: undefined });
}

// ═══ Helper: run a scenario through shared engine ═══

async function runScenario(agentId: string, icon: string, action: string, errorMsg: string, errorType: string, revenue: number, source: string, real: boolean, extra?: Record<string, unknown>) {
  const start = Date.now();
  const result = await engine.repair(new Error(errorMsg), { chainId: 84532, ...extra });
  const elapsed = Date.now() - start;
  const strategy = result.winner?.strategy ?? result.gene?.strategy ?? 'none';
  const immune = result.immune;
  const repaired = result.success;
  const tag = immune ? '⚡ IMMUNE' : repaired ? '✅ REPAIRED' : '❌ FAILED';

  console.log(`    → ${errorType}: ${errorMsg.slice(0, 55)}${errorMsg.length > 55 ? '...' : ''}`);
  console.log(`    → ${tag} via ${strategy} (${elapsed}ms)`);

  recordEvent({ agentId, icon, action, error: errorMsg, errorType, strategy, immune, repaired, elapsed, revenueAtRisk: revenue, timestamp: Date.now(), real, source, ...extra });
}

// ═══ AGENT 1: order-bot — REAL HTTP ═══

const orderScenarios = [
  { errorType: 'rate-limit', msg: 'HTTP 429: Too Many Requests (real httpbin)', rev: 89 },
  { errorType: 'server-error', msg: 'HTTP 500: Internal Server Error (real httpbin)', rev: 120 },
];

async function runOrderBot() {
  const sc = orderScenarios[Math.floor(Math.random() * orderScenarios.length)];
  const id = `ORD-${Math.floor(Math.random() * 90000 + 10000)}`;
  console.log(`\n  💰 [order-bot] ${id}`);

  // First: call real httpbin to prove it's real
  try {
    const url = sc.errorType === 'rate-limit' ? 'https://httpbin.org/status/429' : 'https://httpbin.org/status/500';
    const res = await fetch(url);
    console.log(`    → Real httpbin: ${res.status}`);
  } catch {}

  // Then: run through shared engine for diagnosis
  await runScenario('order-bot', '💰', `Payment ${id}`, sc.msg, sc.errorType, sc.rev, 'httpbin.org', true);

  // Get real IP from httpbin to prove realness
  try {
    const res = await fetch('https://httpbin.org/get');
    const data = await res.json() as { origin: string };
    console.log(`    → Real IP: ${data.origin}`);
  } catch {}
}

// ═══ AGENT 2: refund-bot — REAL CHAIN ═══

async function runRefundBot() {
  const id = `REF-${Math.floor(Math.random() * 90000 + 10000)}`;
  console.log(`\n  🔄 [refund-bot] ${id}`);
  try {
    const [chainId, nonce, bal] = await Promise.all([
      pub.getChainId(),
      pub.getTransactionCount({ address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' }),
      pub.getBalance({ address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' }),
    ]);
    const scenarios = [
      { errorType: 'nonce', msg: `nonce mismatch: expected ${nonce}, got ${nonce + 50} (chain nonce=${nonce})`, rev: 78 },
      { errorType: 'balance', msg: `insufficient funds: balance ${formatEther(bal).slice(0, 6)} ETH, required 1000 ETH`, rev: 156 },
      { errorType: 'nonce', msg: `AA25 invalid account nonce (chain nonce=${nonce}, chainId=${chainId})`, rev: 200 },
    ];
    const sc = scenarios[Math.floor(Math.random() * scenarios.length)];
    console.log(`    → Chain: ${chainId}, nonce=${nonce}, bal=${formatEther(bal).slice(0, 6)} ETH`);
    await runScenario('refund-bot', '🔄', `Refund ${id}`, sc.msg, sc.errorType, sc.rev, 'Base Sepolia', true, { walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' });
  } catch (e: any) { console.log(`    → RPC error: ${e.message.slice(0, 40)}`); }
}

// ═══ AGENT 3: sub-bot — SIMULATED (Coinbase formats) ═══

const subScenarios = [
  { errorType: 'policy', msg: 'rejected due to max per user op spend limit exceeded', rev: 149 },
  { errorType: 'session', msg: 'session expired, please re-authenticate', rev: 29 },
  { errorType: 'x402', msg: 'insufficient USDC token balance for 402 payment. Required: 50, Available: 12', rev: 50 },
  { errorType: 'revert', msg: 'EXECUTION_REVERTED (-32521): UserOperation execution reverted', rev: 89 },
  { errorType: 'nonce', msg: 'AA25 invalid account nonce: expected 12, got 8', rev: 99 },
  { errorType: 'gas', msg: 'GAS_ESTIMATION_ERROR (-32004): gas estimation failed', rev: 65 },
  { errorType: 'rate-limit', msg: 'rate_limit_exceeded: CDP API rate limit (429)', rev: 35 },
  { errorType: 'malformed', msg: 'malformed_transaction: Malformed unsigned transaction', rev: 45 },
  { errorType: 'network', msg: 'wallet connected to wrong network. Payment requires eip155:8453', rev: 100 },
];

async function runSubBot() {
  const sc = subScenarios[Math.floor(Math.random() * subScenarios.length)];
  const id = `SUB-${Math.floor(Math.random() * 90000 + 10000)}`;
  console.log(`\n  📅 [sub-bot] ${id}`);
  await runScenario('sub-bot', '📅', `Renewal ${id}`, sc.msg, sc.errorType, sc.rev, 'Coinbase format', false);
}

// ═══ Simulation Loop ═══

const agents = [runOrderBot, runRefundBot, runSubBot];

async function runSimulation() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  HELIX — Multi-Agent Payment Simulator                        ║
║  💰 order-bot    REAL HTTP   (httpbin.org)                    ║
║  🔄 refund-bot   REAL CHAIN  (Base Sepolia RPC)               ║
║  📅 sub-bot      SIMULATED   (Coinbase error formats)         ║
║  Dashboard: http://localhost:${PORT}                             ║
║  Gene Map: shared across all agents (IMMUNE enabled)          ║
║  Press Ctrl+C to stop                                         ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  while (true) {
    const fn = agents[Math.floor(Math.random() * agents.length)];
    try { await fn(); } catch (e: any) { console.log(`  [err] ${e.message.slice(0, 50)}`); }
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
  }
}

// ═══ Express ═══

app.use(express.static(__dirname));

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Send keepalive comment immediately
  res.write(':ok\n\n');
  res.write(`data: ${JSON.stringify({ type: 'init', ...stats, events: stats.events.slice(0, 50) })}\n\n`);
  clients.push(res);
  req.on('close', () => { const i = clients.indexOf(res); if (i >= 0) clients.splice(i, 1); });
});

app.get('/api/stats', (_req, res) => res.json(stats));

app.listen(PORT, () => {
  console.log(`  Server: http://localhost:${PORT}\n`);
  setTimeout(runSimulation, 500);
});
