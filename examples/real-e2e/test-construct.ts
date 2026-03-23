#!/usr/bin/env node
/**
 * Test LLM Construct with real Claude API
 * Run: ANTHROPIC_API_KEY=... npx tsx examples/real-e2e/test-construct.ts
 */
import { createEngine } from '../../packages/core/src/engine/wrap.js';
import type { WrapOptions } from '../../packages/core/src/engine/types.js';

async function main() {
  const engine = createEngine({
    mode: 'auto', agentId: 'construct-test', geneMapPath: ':memory:',
    llm: { provider: 'anthropic', enabled: true, timeoutMs: 10000 },
    verbose: true,
  } as WrapOptions);

  console.log('═══ Test 1: Completely unknown error ═══\n');
  const r1 = await engine.repair(new Error('MERKLE_PROOF_INVALID: state root mismatch after L2 batch submission'));
  console.log(`  Code:     ${r1.failure.code}`);
  console.log(`  Strategy: ${r1.winner?.strategy ?? 'none'}`);
  console.log(`  Source:   ${(r1.winner as any)?.source ?? 'N/A'}`);
  console.log(`  LLM:     ${(r1.failure as any).llmClassified ? 'perceive' : 'no'}${(r1.winner as any)?.source === 'llm' ? ' + construct' : ''}`);

  console.log('\n═══ Test 2: Another unknown error ═══\n');
  const r2 = await engine.repair(new Error('ZKPROOF_VERIFICATION_TIMEOUT: proof generation exceeded 30s'));
  console.log(`  Strategy: ${r2.winner?.strategy ?? 'none'}`);
  console.log(`  Source:   ${(r2.winner as any)?.source ?? 'N/A'}`);

  console.log('\n═══ Test 3: Known error (no LLM needed) ═══\n');
  const r3 = await engine.repair(new Error('nonce mismatch'));
  console.log(`  Strategy: ${r3.winner?.strategy ?? r3.gene?.strategy ?? 'none'}`);
  console.log(`  Immune:   ${r3.immune}`);

  console.log('\n═══ Test 4: Repeat of #1 → IMMUNE ═══\n');
  const r4 = await engine.repair(new Error('MERKLE_PROOF_INVALID: another state root mismatch'));
  console.log(`  Strategy: ${r4.winner?.strategy ?? r4.gene?.strategy ?? 'none'}`);
  console.log(`  Immune:   ${r4.immune} ${r4.immune ? '⚡' : ''}`);

  console.log('\n═══ Summary ═══');
  console.log(`  Test 1: Unknown → LLM → ${r1.winner?.strategy ?? 'none'}`);
  console.log(`  Test 2: Unknown → LLM → ${r2.winner?.strategy ?? 'none'}`);
  console.log(`  Test 3: Known  → Seed Gene → ${r3.gene?.strategy ?? 'none'} (no LLM)`);
  console.log(`  Test 4: Repeat → IMMUNE → ${r4.gene?.strategy ?? 'none'} ${r4.immune ? '⚡' : ''}`);
  console.log('');
}

main().catch(console.error);
