#!/usr/bin/env node
/**
 * Test Gene Reasoning with real LLM
 * Run: ANTHROPIC_API_KEY=... npx tsx examples/real-e2e/test-reasoning.ts
 */
import { createEngine } from '../../packages/core/src/engine/wrap.js';
import type { WrapOptions } from '../../packages/core/src/engine/types.js';

async function main() {
  const engine = createEngine({
    mode: 'auto', agentId: 'reasoning-test', geneMapPath: ':memory:',
    llm: { provider: 'anthropic', enabled: true, timeoutMs: 10000 },
    verbose: true,
  } as WrapOptions);

  console.log('═══ Step 1: Repair nonce error 4 times ═══\n');
  for (let i = 1; i <= 4; i++) {
    const r = await engine.repair(new Error('nonce mismatch: expected 5, got 3'), { chainId: 84532 });
    console.log(`  #${i}: ${r.winner?.strategy ?? r.gene?.strategy} | immune: ${r.immune} | q: ${r.gene?.qValue?.toFixed(3) ?? 'N/A'}`);
  }

  console.log('\n  Waiting 10s for async LLM reasoning...\n');
  await new Promise(r => setTimeout(r, 10000));

  console.log('═══ Step 2: Check Gene reasoning ═══\n');
  const gene = engine.getGeneMap().lookup('verification-failed' as any, 'signature' as any);
  if (gene) {
    console.log(`  Strategy:  ${gene.strategy}`);
    console.log(`  Q-Value:   ${gene.qValue.toFixed(3)}`);
    console.log(`  Fixes:     ${gene.successCount}`);
    console.log(`  Reasoning: ${gene.reasoning || '(empty — LLM may not have responded)'}`);
  } else {
    console.log('  ❌ Gene not found');
  }
  console.log('');
  engine.getGeneMap().close();
}

main().catch(console.error);
