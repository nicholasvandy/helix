#!/usr/bin/env npx tsx

/**
 * Local API proxy that captures token usage from Claude API calls.
 *
 * Usage:
 *   npx tsx scripts/proxy.ts                    # Start proxy on port 9842
 *   npx tsx scripts/proxy.ts --port 9999        # Custom port
 *   npx tsx scripts/proxy.ts --stats            # Show captured stats and exit
 *
 * Then set:
 *   export ANTHROPIC_BASE_URL=http://localhost:9842
 */

import http from 'node:http';
import https from 'node:https';
import { GeneMap } from '../packages/core/src/engine/gene-map.js';
import { classifyTask, type TaskType } from '../packages/core/src/engine/task-classifier.js';
import { calculateCost } from '../packages/core/src/engine/token-cost.js';

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '9842');
const TARGET_HOST = 'api.anthropic.com';

// --stats mode
if (process.argv.includes('--stats')) {
  const geneMap = new GeneMap('./helix-genes.db');
  const db = geneMap.database;
  try {
    const stats = db.prepare(`
      SELECT COUNT(*) as total, SUM(token_cost_usd) as total_cost,
             SUM(input_tokens) as total_input, SUM(output_tokens) as total_output,
             COUNT(DISTINCT task_type) as task_types
      FROM capsules WHERE token_cost_usd IS NOT NULL
    `).get() as any;

    const byType = db.prepare(`
      SELECT task_type, COUNT(*) as count, ROUND(AVG(token_cost_usd), 6) as avg_cost,
             ROUND(SUM(token_cost_usd), 6) as total_cost,
             ROUND(AVG(input_tokens)) as avg_input, ROUND(AVG(output_tokens)) as avg_output
      FROM capsules WHERE token_cost_usd IS NOT NULL AND task_type IS NOT NULL
      GROUP BY task_type ORDER BY count DESC
    `).all() as any[];

    console.log('\n📊 Dogfooding Stats');
    console.log(`   Total capsules:   ${stats?.total || 0}`);
    console.log(`   Total cost:       $${(stats?.total_cost || 0).toFixed(4)}`);
    console.log(`   Total tokens:     ${(stats?.total_input || 0).toLocaleString()} in / ${(stats?.total_output || 0).toLocaleString()} out`);
    console.log(`   Task types seen:  ${stats?.task_types || 0}`);

    if (byType?.length) {
      console.log('\n   By task type:');
      for (const row of byType) {
        console.log(`     ${(row.task_type || 'unknown').padEnd(14)} ${String(row.count).padStart(3)} capsules  avg $${row.avg_cost.toFixed(4)}  total $${row.total_cost.toFixed(4)}`);
      }
    }
  } catch (e) {
    console.log('Could not read stats:', (e as Error).message);
  }
  geneMap.close();
  process.exit(0);
}

// --- Proxy mode ---
const geneMap = new GeneMap('./helix-genes.db');
const db = geneMap.database;

// Ensure capsules table exists (in case migration hasn't run)
db.exec(`CREATE TABLE IF NOT EXISTS capsules (id TEXT PRIMARY KEY, session_id TEXT, tool_name TEXT, input TEXT, output TEXT, success INTEGER DEFAULT 1, error_type TEXT, repair_strategy TEXT, duration_ms INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), task_type TEXT, token_cost_usd REAL, input_tokens INTEGER, output_tokens INTEGER, model TEXT, num_api_calls INTEGER)`);

interface SessionAccumulator {
  taskType: TaskType;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  numApiCalls: number;
  model: string;
  firstSeen: number;
  lastSeen: number;
}

const sessions = new Map<string, SessionAccumulator>();

function flushSession(sessionId: string, session: SessionAccumulator) {
  try {
    db.prepare(`
      INSERT INTO capsules (id, session_id, tool_name, input, output, success, duration_ms,
        task_type, token_cost_usd, input_tokens, output_tokens, model, num_api_calls)
      VALUES (?, ?, 'claude-code', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      JSON.stringify({ taskType: session.taskType }),
      JSON.stringify({ calls: session.numApiCalls }),
      session.lastSeen - session.firstSeen,
      session.taskType,
      Math.round(session.totalCostUSD * 1_000_000) / 1_000_000,
      session.totalInputTokens,
      session.totalOutputTokens,
      session.model,
      session.numApiCalls,
    );
  } catch (e) {
    console.error('[proxy] Failed to store capsule:', (e as Error).message);
  }
}

// Flush idle sessions every 30s
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastSeen > 5 * 60 * 1000) {
      flushSession(id, session);
      sessions.delete(id);
      console.log(`[proxy] 💊 Capsule saved: ${session.taskType} | ${session.numApiCalls} calls | $${session.totalCostUSD.toFixed(4)}`);
    }
  }
}, 30_000);

function extractUserPrompt(body: any): string {
  try {
    if (body?.messages) {
      for (const msg of body.messages) {
        if (msg.role === 'user') {
          if (typeof msg.content === 'string') return msg.content;
          if (Array.isArray(msg.content)) {
            const text = msg.content.find((c: any) => c.type === 'text');
            if (text) return text.text;
          }
        }
      }
    }
  } catch {}
  return '';
}

function deriveSessionId(body: any): string {
  try {
    if (body?.system) {
      const sys = typeof body.system === 'string' ? body.system : JSON.stringify(body.system);
      let hash = 0;
      const str = sys.slice(0, 200);
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return `session-${Math.abs(hash).toString(36)}`;
    }
  } catch {}
  return `session-${Date.now()}`;
}

const server = http.createServer((req, res) => {
  const bodyChunks: Buffer[] = [];

  req.on('data', (chunk) => bodyChunks.push(chunk));
  req.on('end', () => {
    const bodyBuffer = Buffer.concat(bodyChunks);
    let requestBody: any = null;
    try { requestBody = JSON.parse(bodyBuffer.toString()); } catch {}

    const options: https.RequestOptions = {
      hostname: TARGET_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: TARGET_HOST },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      // Forward headers first
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);

      const responseChunks: Buffer[] = [];
      proxyRes.on('data', (chunk) => {
        responseChunks.push(chunk);
        res.write(chunk);
      });

      proxyRes.on('end', () => {
        res.end();

        // Parse for token usage (non-streaming /v1/messages)
        if (req.url?.includes('/v1/messages') && req.method === 'POST') {
          try {
            const responseBody = JSON.parse(Buffer.concat(responseChunks).toString());
            if (responseBody?.usage) {
              const inputTokens = responseBody.usage.input_tokens || 0;
              const outputTokens = responseBody.usage.output_tokens || 0;
              const model = responseBody.model || requestBody?.model || 'unknown';
              const costUSD = calculateCost({ inputTokens, outputTokens, model });
              const sessionId = deriveSessionId(requestBody);
              const userPrompt = extractUserPrompt(requestBody);

              if (!sessions.has(sessionId)) {
                sessions.set(sessionId, {
                  taskType: classifyTask(userPrompt),
                  totalInputTokens: 0, totalOutputTokens: 0, totalCostUSD: 0,
                  numApiCalls: 0, model, firstSeen: Date.now(), lastSeen: Date.now(),
                });
              }

              const session = sessions.get(sessionId)!;
              session.totalInputTokens += inputTokens;
              session.totalOutputTokens += outputTokens;
              session.totalCostUSD += costUSD;
              session.numApiCalls += 1;
              session.lastSeen = Date.now();
              session.model = model;

              console.log(`[proxy] ${session.taskType} | +${inputTokens}/${outputTokens} tokens | +$${costUSD.toFixed(4)} | session: $${session.totalCostUSD.toFixed(4)} (${session.numApiCalls} calls)`);
            }
          } catch {
            // Streaming responses won't parse — fine
          }
        }
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[proxy] Forward error:', err.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'proxy_error', message: err.message }));
    });

    proxyReq.write(bodyBuffer);
    proxyReq.end();
  });
});

function flushAll() {
  for (const [id, session] of sessions.entries()) {
    flushSession(id, session);
    console.log(`[proxy] 💊 Final flush: ${session.taskType} | ${session.numApiCalls} calls | $${session.totalCostUSD.toFixed(4)}`);
  }
  sessions.clear();
}

process.on('SIGINT', () => { flushAll(); geneMap.close(); process.exit(0); });
process.on('SIGTERM', () => { flushAll(); geneMap.close(); process.exit(0); });

server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║  HELIX DATA PROXY                     ║
  ╚═══════════════════════════════════════╝
  http://localhost:${PORT}
  Forwarding to: ${TARGET_HOST}

  Set this env var to capture data:
    export ANTHROPIC_BASE_URL=http://localhost:${PORT}

  Sessions flush after 5 min idle.
  View stats: npx tsx scripts/proxy.ts --stats
  `);
});
