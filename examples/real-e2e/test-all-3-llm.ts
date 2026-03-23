#!/usr/bin/env node
/**
 * Helix — 3-Point LLM Integration Test
 * Proves all 3 LLM integration points work with real Claude API:
 *   1. Perceive (classify unknown error)
 *   2. Reasoning (explain why strategy works)
 *   3. Construct (suggest strategies when adapters return empty)
 *
 * Run: ANTHROPIC_API_KEY=... npx tsx examples/real-e2e/test-all-3-llm.ts
 */

async function main() {
  const { GeneMap } = await import('../../packages/core/src/engine/gene-map.js');
  const { PcecEngine } = await import('../../packages/core/src/engine/pcec.js');

  const geneMap = new GeneMap(':memory:');
  const engine = new PcecEngine(geneMap, 'llm-3point-test', {
    mode: 'auto',
    llm: {
      provider: 'anthropic',
      enabled: true,
      apiKey: process.env.HELIX_LLM_API_KEY || process.env.ANTHROPIC_API_KEY,
      timeoutMs: 15000,
    },
    verbose: true,
  } as any);

  // Empty adapter — forces LLM on every stage
  engine.registerAdapter({
    name: 'empty' as any,
    perceive: () => null,
    construct: () => [],
  });

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  HELIX — 3-Point LLM Integration Test               ║');
  console.log('║  All adapters disabled → forces LLM on every stage   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ═══ Point 1: Perceive ═══
  console.log('═══ LLM Point 1: Perceive (classify unknown error) ═══\n');

  const r1 = await engine.repair(
    new Error('SmartAccount validation failed: the account implementation at 0xABC does not support the requested entry point version, causing signature verification to fail during bundler processing'),
  );

  const p1 = (r1.failure as any).llmClassified;
  console.log(`  Error: SmartAccount validation failed`);
  console.log(`  LLM Perceive: ${p1 ? '✅ YES' : '❌ NO'}`);
  console.log(`  Classification: ${r1.failure.code}/${r1.failure.category}`);
  console.log(`  Reasoning: ${(r1.failure as any).llmReasoning || 'none'}`);

  // ═══ Point 3: Construct ═══
  console.log('\n═══ LLM Point 3: Construct (suggest strategy) ═══\n');

  const s1 = r1.winner?.strategy;
  const src1 = (r1.winner as any)?.source;
  console.log(`  Strategy: ${s1 || 'none'}`);
  console.log(`  Source: ${src1 || 'N/A'}`);
  console.log(`  LLM Construct: ${src1 === 'llm' ? '✅ YES' : '❌ NO'}`);
  if (r1.winner) {
    console.log(`  Confidence: ${r1.winner.successProbability}`);
    console.log(`  Reasoning: ${(r1.winner as any).reasoning || 'none'}`);
  }

  // ═══ Build up successCount ═══
  console.log('\n═══ Building successCount for Reasoning trigger ═══\n');

  for (let i = 2; i <= 4; i++) {
    const ri = await engine.repair(
      new Error('SmartAccount validation failed: entry point version mismatch during bundler processing'),
    );
    console.log(`  Repair #${i}: ${ri.gene?.strategy || ri.winner?.strategy || 'none'} | immune: ${ri.immune} | q: ${ri.gene?.qValue?.toFixed(3) ?? 'N/A'}`);
  }

  // ═══ Point 2: Reasoning ═══
  console.log('\n═══ LLM Point 2: Reasoning (async, waiting 12s) ═══\n');

  await new Promise(r => setTimeout(r, 12000));

  const gene = geneMap.lookup(r1.failure.code as any, r1.failure.category as any);
  console.log(`  Gene: ${gene?.strategy ?? 'not found'}`);
  console.log(`  Q-Value: ${gene?.qValue?.toFixed(3) ?? 'N/A'}`);
  console.log(`  Fixes: ${gene?.successCount ?? 0}`);
  console.log(`  Reasoning: ${gene?.reasoning || '(empty)'}`);
  const hasReasoning = !!(gene?.reasoning && gene.reasoning.length > 20);
  console.log(`  LLM Reasoning: ${hasReasoning ? '✅ YES' : '❌ NO'}`);

  // ═══ Summary ═══
  const allThree = p1 && (src1 === 'llm') && hasReasoning;

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  3-POINT LLM SUMMARY                                ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  1. Perceive:  ${p1 ? '✅ LLM classified' : '❌ not triggered'}`.padEnd(55) + '║');
  console.log(`║  2. Reasoning: ${hasReasoning ? '✅ LLM generated' : '❌ not generated'}`.padEnd(55) + '║');
  console.log(`║  3. Construct: ${src1 === 'llm' ? '✅ LLM suggested' : '❌ adapter had candidates'}`.padEnd(55) + '║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  ALL 3: ${allThree ? '✅ ✅ ✅ ALL PROVEN' : '⚠️  PARTIAL'}`.padEnd(55) + '║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  geneMap.close();
}

main().catch(console.error);
