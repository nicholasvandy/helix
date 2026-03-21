#!/usr/bin/env node
import { createEngine } from './engine/wrap.js';
import type { WrapOptions } from './engine/types.js';

const command = process.argv[2];

function printHelp() {
  console.log(`
  \x1b[36m╔═══════════════════════════════════════╗\x1b[0m
  \x1b[36m║\x1b[0m  \x1b[1mHELIX\x1b[0m — Self-Healing Agent Infra     \x1b[36m║\x1b[0m
  \x1b[36m╚═══════════════════════════════════════╝\x1b[0m

  Usage: npx helix <command>

  Commands:
    status     Show Gene Map health
    simulate   Dry-run diagnosis
    gc         Gene Map garbage collection
    stats      Agent attribution stats
    help       Show this help

  Examples:
    npx helix status
    npx helix simulate "AA25 Invalid account nonce"
    npx helix gc
    npx helix stats bot-1
  `);
}

function status() {
  const engine = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
  const h = engine.getGeneMap().health();
  console.log(`
  ┌─────────────────────────────────────┐
  │  HELIX Gene Map Status              │
  ├─────────────────────────────────────┤
  │  Total Genes:    ${String(h.totalGenes).padStart(6)}           │
  │  Avg Q-Value:    ${h.avgQValue.toFixed(3).padStart(6)}           │
  │  Platforms:      ${(h.platforms || []).join(', ').slice(0, 18).padEnd(18)}│
  ├─────────────────────────────────────┤
  │  Top Strategies:                    │`);
  for (const s of (h.topStrategies || []).slice(0, 5)) {
    console.log(`  │    ${s.strategy.padEnd(22)} q=${s.qValue.toFixed(2)}  │`);
  }
  console.log(`  └─────────────────────────────────────┘`);
  engine.getGeneMap().close();
}

async function simulateCmd(errorMsg: string) {
  const { simulateAsync } = await import('./testing.js');
  const result = await simulateAsync({ error: errorMsg });
  const strategy = result.winner?.strategy ?? result.gene?.strategy ?? 'none';
  console.log(`
  ┌─────────────────────────────────────┐
  │  HELIX Simulate                     │
  ├─────────────────────────────────────┤
  │  Error:    ${errorMsg.slice(0, 25).padEnd(25)}│
  │  Code:     ${(result.failure.code).padEnd(25)}│
  │  Category: ${(result.failure.category).padEnd(25)}│
  │  Immune:   ${String(result.immune).padEnd(25)}│
  │  Strategy: ${strategy.padEnd(25)}│
  │  Mode:     observe (dry-run)        │
  └─────────────────────────────────────┘
  `);
}

function gc() {
  const engine = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
  const r = engine.getGeneMap().gc();
  console.log(`
  ┌─────────────────────────────────────┐
  │  HELIX Gene Map GC                  │
  ├─────────────────────────────────────┤
  │  Merged:   ${String(r.merged).padStart(6)}                   │
  │  Pruned:   ${String(r.pruned).padStart(6)}                   │
  │  Archived: ${String(r.archived).padStart(6)}                   │
  └─────────────────────────────────────┘
  `);
  engine.getGeneMap().close();
}

function agentStats(agentId: string) {
  const engine = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
  const s = engine.getGeneMap().getAgentStats(agentId);
  console.log(`
  ┌─────────────────────────────────────┐
  │  HELIX Agent: ${agentId.slice(0, 21).padEnd(21)}│
  ├─────────────────────────────────────┤
  │  Total Failures: ${String(s.totalFailures).padStart(6)}              │
  │  Success Rate:   ${(s.successRate * 100).toFixed(1).padStart(5)}%              │
  └─────────────────────────────────────┘
  `);
  engine.getGeneMap().close();
}

(async () => {
  switch (command) {
    case 'status': status(); break;
    case 'simulate': {
      const msg = process.argv[3];
      if (!msg) { console.error('Usage: npx helix simulate "error message"'); process.exit(1); }
      await simulateCmd(msg);
      break;
    }
    case 'gc': gc(); break;
    case 'stats': {
      const id = process.argv[3];
      if (!id) { console.error('Usage: npx helix stats <agent-id>'); process.exit(1); }
      agentStats(id);
      break;
    }
    case 'help': case '--help': case '-h': case undefined: printHelp(); break;
    default: console.error(`Unknown command: ${command}`); printHelp(); process.exit(1);
  }
})();
