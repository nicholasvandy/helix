#!/usr/bin/env node
/**
 * Minimal Gene Registry Server (in-memory).
 *
 * Start: npx tsx packages/core/src/registry-server.ts
 */
import http from 'node:http';

interface RegistryGene {
  id: string;
  failureCode: string;
  failureCategory: string;
  strategy: string;
  qValue: number;
  qVariance?: number;
  successCount: number;
  platforms: string[];
  reasoning?: string;
  contributorAgentId?: string;
  createdAt: number;
  lastVerifiedAt?: number;
  verifiedByCount?: number;
}

const genes = new Map<string, RegistryGene>();
const agents = new Set<string>();

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString(); });
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const agentId = (req.headers['x-agent-id'] as string) || 'anonymous';
  agents.add(agentId);

  if (path === '/v1/health' && req.method === 'GET') {
    return json(res, { status: 'ok', totalGenes: genes.size, totalAgents: agents.size, uptime: process.uptime() });
  }

  if (path === '/v1/genes/push' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req)) as { genes: RegistryGene[] };
    let accepted = 0, rejected = 0;

    for (const gene of body.genes) {
      const key = `${gene.failureCode}:${gene.failureCategory}`;
      const existing = genes.get(key);

      if (!existing || gene.qValue > existing.qValue || gene.successCount > existing.successCount) {
        genes.set(key, {
          ...gene, id: key, contributorAgentId: agentId,
          lastVerifiedAt: Date.now(),
          verifiedByCount: (existing?.verifiedByCount ?? 0) + 1,
        });
        accepted++;
      } else {
        existing.verifiedByCount = (existing.verifiedByCount ?? 0) + 1;
        existing.lastVerifiedAt = Date.now();
        rejected++;
      }
    }

    return json(res, { accepted, rejected, total: genes.size });
  }

  if (path === '/v1/genes/pull' && req.method === 'GET') {
    const minQ = parseFloat(url.searchParams.get('minQ') ?? '0.5');
    const limit = parseInt(url.searchParams.get('limit') ?? '100');

    const results = [...genes.values()]
      .filter(g => g.qValue >= minQ)
      .sort((a, b) => ((b.verifiedByCount ?? 1) * b.qValue) - ((a.verifiedByCount ?? 1) * a.qValue))
      .slice(0, limit);

    return json(res, { genes: results, total: genes.size });
  }

  if (path === '/v1/stats' && req.method === 'GET') {
    const topGenes = [...genes.values()]
      .sort((a, b) => b.qValue - a.qValue)
      .slice(0, 10)
      .map(g => ({ code: g.failureCode, strategy: g.strategy, qValue: g.qValue, verifiedBy: g.verifiedByCount ?? 0 }));

    return json(res, {
      totalGenes: genes.size, totalAgents: agents.size, topGenes,
      platforms: [...new Set([...genes.values()].flatMap(g => g.platforms))],
    });
  }

  json(res, { error: 'Not found' }, 404);
});

const PORT = parseInt(process.env.HELIX_REGISTRY_PORT || '7844');
server.listen(PORT, () => {
  console.log(`\n  🧬 Gene Registry: http://localhost:${PORT}`);
  console.log(`     POST /v1/genes/push — share Genes`);
  console.log(`     GET  /v1/genes/pull — learn from network`);
  console.log(`     GET  /v1/health     — status`);
  console.log(`     GET  /v1/stats      — top Genes\n`);
});

export { server };
