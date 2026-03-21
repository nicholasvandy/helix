import { Router } from 'express';
import type { Request, Response } from 'express';
import { createEngine } from '@helix-agent/core';
import type { WrapOptions } from '@helix-agent/core';

const router = Router();

const engine = createEngine({
  mode: 'auto',
  agentId: 'helix-api',
  geneMapPath: './helix-api-genes.db',
} as WrapOptions);

router.post('/v1/diagnose', async (req: Request, res: Response) => {
  try {
    const { error, context } = req.body;
    if (!error || typeof error !== 'string') {
      res.status(400).json({ error: 'Missing required field: "error" (string)' });
      return;
    }
    const observeEngine = createEngine({
      mode: 'observe',
      agentId: (context as Record<string, unknown>)?.agentId as string ?? 'api-client',
      geneMapPath: './helix-api-genes.db',
    } as WrapOptions);
    const result = await observeEngine.repair(new Error(error), context as Record<string, unknown>);
    res.json({
      success: true,
      diagnosis: {
        code: result.failure.code,
        category: result.failure.category,
        severity: result.failure.severity,
        platform: result.failure.platform,
      },
      recommendation: result.winner ? {
        strategy: result.winner.strategy,
        description: result.winner.description,
        confidence: result.gene?.qValue ?? result.winner.successProbability,
        estimatedCostUsd: result.winner.estimatedCostUsd,
        estimatedSpeedMs: result.winner.estimatedSpeedMs,
      } : null,
      immune: result.immune,
      gene: result.gene ? {
        strategy: result.gene.strategy,
        qValue: result.gene.qValue,
        successCount: result.gene.successCount,
        platforms: result.gene.platforms,
      } : null,
      explanation: result.explanation,
    });
  } catch (err) {
    res.status(500).json({ error: `Internal error: ${(err as Error).message}` });
  }
});

router.post('/v1/repair', async (req: Request, res: Response) => {
  try {
    const { error, context } = req.body;
    if (!error || typeof error !== 'string') {
      res.status(400).json({ error: 'Missing required field: "error" (string)' });
      return;
    }
    const result = await engine.repair(new Error(error), context as Record<string, unknown>);
    res.json({
      success: result.success,
      repaired: result.success && result.verified,
      verified: result.verified,
      diagnosis: {
        code: result.failure.code,
        category: result.failure.category,
        severity: result.failure.severity,
        platform: result.failure.platform,
      },
      strategy: result.winner?.strategy ?? result.gene?.strategy ?? null,
      immune: result.immune,
      gene: result.gene ? {
        strategy: result.gene.strategy,
        qValue: result.gene.qValue,
        successCount: result.gene.successCount,
        platforms: result.gene.platforms,
      } : null,
      explanation: result.explanation,
      totalMs: result.totalMs,
    });
  } catch (err) {
    res.status(500).json({ error: `Internal error: ${(err as Error).message}` });
  }
});

router.get('/v1/check/:code/:category', (req: Request, res: Response) => {
  const gene = engine.getGeneMap().lookup(req.params.code, req.params.category);
  res.json({
    immune: !!gene && gene.qValue > 0.4,
    gene: gene ? {
      strategy: gene.strategy,
      qValue: gene.qValue,
      successCount: gene.successCount,
      platforms: gene.platforms,
    } : null,
  });
});

router.get('/v1/status', (_req: Request, res: Response) => {
  res.json(engine.getGeneMap().stats());
});

router.get('/v1/platforms', (_req: Request, res: Response) => {
  res.json({
    platforms: [
      { name: 'tempo', scenarios: 13, status: 'live' },
      { name: 'privy', scenarios: 7, status: 'live' },
      { name: 'coinbase', scenarios: 8, status: 'live' },
      { name: 'generic', scenarios: 3, status: 'live' },
      { name: 'stripe', scenarios: 0, status: 'coming_soon' },
    ],
    totalScenarios: 31,
    totalStrategies: 26,
    realStrategies: 25,
  });
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
    geneMap: engine.getGeneMap().stats(),
  });
});

export { router };
