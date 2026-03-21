#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { bus, GeneMap, PcecEngine, defaultAdapters } from '@helix-agent/core';
import type { HelixConfig } from '@helix-agent/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 7842;

const configPath = 'helix.config.json';
const config: Partial<HelixConfig> = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, 'utf-8'))
  : {};

const app = express();
const port = config.dashboardPort ?? DEFAULT_PORT;

// Static files
const staticDir = join(__dirname, 'static');
app.use(express.static(staticDir));

// HTML routes
app.get('/', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
app.get('/docs', (_req, res) => res.sendFile(join(staticDir, 'docs.html')));
app.get('/benchmark', (_req, res) => res.sendFile(join(staticDir, 'benchmark.html')));
app.get('/milestone', (_req, res) => res.sendFile(join(staticDir, 'milestone.html')));
app.get('/insights', (_req, res) => res.sendFile(join(staticDir, 'insights.html')));
app.get('/coinbase-demo', (_req, res) => res.sendFile(join(staticDir, 'coinbase-demo.html')));

// SSE endpoint
app.get('/api/helix/stream', (_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  for (const event of bus.getHistory()) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  const unsub = bus.subscribe((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  _req.on('close', unsub);
});

// Gene Map API
app.get('/api/helix/genes', (_req, res) => {
  const dbPath = config.geneMapPath ?? './helix-genes.db';
  if (!existsSync(dbPath)) {
    res.json({ genes: [], count: 0 });
    return;
  }
  const geneMap = new GeneMap(dbPath);
  const genes = geneMap.list();
  const count = geneMap.immuneCount();
  geneMap.close();
  res.json({ genes, count });
});

// Run demo API
app.get('/api/helix/run-demo', async (_req, res) => {
  const demoGeneMap = new GeneMap(':memory:');
  const engine = new PcecEngine(demoGeneMap, 'demo-agent');
  for (const adapter of defaultAdapters) {
    engine.registerAdapter(adapter);
  }

  // Simple demo errors
  const errors = [
    { code: 'payment-insufficient', msg: 'Payment of 500 USDC failed: insufficient balance (have 12.50 USDC)' },
    { code: 'invalid-challenge', msg: 'MPP session sess_7x2k expired at 2026-03-18T10:00:00Z' },
    { code: 'verification-failed', msg: 'Transaction signature invalid: nonce mismatch (expected 42, got 41)' },
  ];

  res.json({ status: 'running', scenarios: errors.length });

  for (const e of errors) {
    const err = new Error(e.msg);
    (err as unknown as Record<string, unknown>).code = e.code;
    await engine.repair(err);
    await new Promise(r => setTimeout(r, 300));
  }
  // Re-run for immunity
  for (const e of errors) {
    const err = new Error(e.msg);
    (err as unknown as Record<string, unknown>).code = e.code;
    await engine.repair(err);
    await new Promise(r => setTimeout(r, 200));
  }
  demoGeneMap.close();
});

app.listen(port, () => {
  console.log(`\n\x1b[1m\x1b[36m  HELIX\x1b[0m Dashboard\n`);
  console.log(`  \x1b[32m●\x1b[0m Running at \x1b[1mhttp://localhost:${port}\x1b[0m`);
  console.log(`  \x1b[2mSSE stream: http://localhost:${port}/api/helix/stream\x1b[0m`);
  console.log(`  \x1b[2mGene API:   http://localhost:${port}/api/helix/genes\x1b[0m`);
  console.log(`  \x1b[2mRun demo:   http://localhost:${port}/api/helix/run-demo\x1b[0m\n`);
});
