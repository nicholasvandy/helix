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
    audit      Show repair audit log
    scan       Scan codebase for payment error patterns
    serve      Start REST API server
    dream      Run Gene Dream consolidation
    migrate    Check and run schema migrations
    self-play  Run autonomous evolution rounds
    federated  Run federated learning round
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
    const sigma = s.qVariance !== undefined ? ` ±${Math.sqrt(s.qVariance).toFixed(2)}` : '';
    const nStr = s.qCount !== undefined ? ` n=${s.qCount}` : '';
    console.log(`  │    ${s.strategy.padEnd(18)} q=${s.qValue.toFixed(2)}${sigma}${nStr} │`);
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
    case 'explain': {
      const msg = process.argv[3];
      if (!msg) { console.error('Usage: npx helix explain "error message"'); process.exit(1); }
      const eng = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
      const r = await eng.repair(new Error(msg));
      const g = eng.getGeneMap().lookup(r.failure.code as any, r.failure.category as any);
      console.log(`\n  Code:      ${r.failure.code}`);
      console.log(`  Category:  ${r.failure.category}`);
      console.log(`  Strategy:  ${r.winner?.strategy ?? r.gene?.strategy ?? 'none'}`);
      console.log(`  Q-Value:   ${g?.qValue?.toFixed(3) ?? 'N/A'}`);
      console.log(`  Immune:    ${r.immune ? 'yes ⚡' : 'no'}`);
      console.log(`  Reasoning: ${g?.reasoning || '(not generated — enable LLM)'}`);
      console.log(`  Root cause: ${r.failure.rootCauseHint ?? 'N/A'}\n`);
      eng.getGeneMap().close();
      break;
    }
    case 'audit': {
      const count = parseInt(process.argv[3] || '20');
      const isJson = process.argv.includes('--json');
      const engine = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
      const log = engine.getGeneMap().getAuditLog(count);
      if (isJson) {
        console.log(JSON.stringify(log, null, 2));
      } else {
        console.log(`\n  HELIX AUDIT LOG (last ${log.length} entries)\n`);
        for (const entry of log) {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          const status = entry.success ? (entry.immune ? '⚡ IMMUNE' : '✅ REPAIRED') : '❌ FAILED';
          console.log(`  ${time}  ${entry.agentId.padEnd(12)} ${entry.failureCode.padEnd(22)} ${status.padEnd(14)} ${entry.strategy.padEnd(20)} ${entry.durationMs}ms`);
        }
        console.log('');
      }
      engine.getGeneMap().close();
      break;
    }
    case 'federated': {
      const eps = parseFloat(process.argv[3] || '1.0');
      const fEng = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
      const { FederatedLearner } = await import('./engine/federated.js');
      const fl = new FederatedLearner(fEng.getGeneMap().database, eps);
      console.log(`\n  Federated Gene Learning (epsilon=${eps})\n`);
      const fr = await fl.federatedRound();
      console.log(`  Gradients computed: ${fr.gradientsComputed}`);
      console.log(`  Gradients pushed:   ${fr.gradientsPushed}`);
      console.log(`  Gradients pulled:   ${fr.gradientsPulled}`);
      console.log(`  Genes updated:      ${fr.genesUpdated}\n`);
      fEng.getGeneMap().close();
      break;
    }
    case 'self-play': {
      const rounds = parseInt(process.argv[3] || '10');
      const spEng = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
      const { SelfPlayEngine } = await import('./engine/self-play.js');
      const sp = new SelfPlayEngine(spEng.getGeneMap().database);
      console.log(`\n  Self-Play Evolution — ${rounds} rounds\n`);
      const session = await sp.runSession(rounds);
      console.log(`  Completed: ${session.completed}/${session.rounds}`);
      console.log(`  Repaired:  ${session.repaired} (${session.completed > 0 ? Math.round(session.repaired / session.completed * 100) : 0}%)`);
      console.log(`  Failed:    ${session.failed}`);
      console.log(`  Duration:  ${session.durationMs}ms`);
      if (session.weaknesses.length > 0) {
        console.log(`\n  Weaknesses (${session.weaknesses.length}):`);
        for (const w of session.weaknesses.slice(0, 5)) console.log(`    • ${w.slice(0, 100)}`);
        if (session.weaknesses.length > 5) console.log(`    ... and ${session.weaknesses.length - 5} more`);
      }
      console.log('');
      spEng.getGeneMap().close();
      break;
    }
    case 'scan': {
      const targetDir = process.argv[3] || '.';
      const isJson = process.argv.includes('--json');
      const isGithub = process.argv.includes('--format') && process.argv[process.argv.indexOf('--format') + 1] === 'github';
      const fs = await import('node:fs');
      const path = await import('node:path');

      const PATTERNS = [
        { re: /AA2[0-9]\b/g, desc: 'ERC-4337 error code' },
        { re: /AA1[0-3]\b/g, desc: 'ERC-4337 validation error' },
        { re: /nonce\s*(too\s*low|mismatch|invalid|expired|desync)/gi, desc: 'Nonce conflict' },
        { re: /gas\s*(exceed|spike|estimation\s*failed|too\s*(low|high)|underpriced)/gi, desc: 'Gas error' },
        { re: /rate\s*limit|429.*too\s*many/gi, desc: 'Rate limiting' },
        { re: /insufficient\s*(funds|balance|USDC|ETH)/gi, desc: 'Insufficient balance' },
        { re: /EXECUTION_REVERTED|execution\s+reverted/gi, desc: 'Transaction revert' },
        { re: /paymaster\s*(deposit|balance|rejected|error|signature)/gi, desc: 'Paymaster error' },
        { re: /402\s*payment\s*required/gi, desc: 'Payment required (402)' },
        { re: /session\s*(expired|timeout|invalid)/gi, desc: 'Session failure' },
        { re: /policy\s*(violation|limit|exceeded)/gi, desc: 'Policy violation' },
      ];

      function findFiles(dir: string): string[] {
        const results: string[] = [];
        try {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === '__pycache__') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) results.push(...findFiles(p));
            else if (/\.(ts|js|tsx|jsx|py|sol|rs)$/.test(e.name)) results.push(p);
          }
        } catch {}
        return results;
      }

      const files = findFiles(targetDir);
      interface Finding { file: string; line: number; pattern: string; match: string }
      const findings: Finding[] = [];
      const seen = new Set<string>();

      for (const file of files) {
        try {
          const lines = fs.readFileSync(file, 'utf-8').split('\n');
          for (let i = 0; i < lines.length; i++) {
            for (const { re, desc } of PATTERNS) {
              re.lastIndex = 0;
              let m;
              while ((m = re.exec(lines[i])) !== null) {
                const key = `${file}:${i + 1}:${desc}`;
                if (!seen.has(key)) { seen.add(key); findings.push({ file: path.relative(targetDir, file), line: i + 1, pattern: desc, match: m[0].slice(0, 50) }); }
              }
            }
          }
        } catch {}
      }

      if (isJson) {
        console.log(JSON.stringify({ scanDir: path.resolve(targetDir), filesScanned: files.length, findings, summary: { total: findings.length } }, null, 2));
      } else if (isGithub) {
        for (const f of findings) console.log(`::warning file=${f.file},line=${f.line}::Payment pattern: ${f.pattern} (${f.match})`);
        console.log(`\n  Summary: ${findings.length} payment patterns found`);
      } else {
        console.log(`\n  Helix Payment Safety Scan`);
        console.log(`  Scanning: ${path.resolve(targetDir)}`);
        console.log(`  Files: ${files.length}\n`);
        if (findings.length === 0) {
          console.log('  ✓ No payment error patterns found.\n');
        } else {
          for (const f of findings) {
            console.log(`    ${f.file}:${f.line}`);
            console.log(`      ${f.pattern}: "${f.match}"\n`);
          }
          console.log(`  Summary: ${findings.length} payment patterns found\n`);
        }
      }
      process.exit(findings.length > 0 ? 1 : 0);
    }
    case 'migrate': {
      const { needsMigration, runMigrations, CURRENT_SCHEMA_VERSION } = await import('./engine/migrations.js');
      const mEng = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
      const mDb = mEng.getGeneMap().database;
      const check = needsMigration(mDb);
      console.log(`\n  Schema: v${check.currentVersion} → v${check.targetVersion}`);
      if (!check.needed) {
        console.log('  ✓ Already up to date.\n');
      } else {
        console.log(`  ${check.pendingCount} migration(s) pending...`);
        const applied = runMigrations(mDb, { decayOnMajorBump: true });
        for (const m of applied) console.log(`  ✓ v${m.version}: ${m.description}`);
        console.log('  Done.\n');
      }
      mEng.getGeneMap().close();
      break;
    }
    case 'dream': {
      const { GeneDream } = await import('./engine/dream.js');
      const dreamEngine = createEngine({ mode: 'observe', agentId: 'cli', geneMapPath: ':memory:' } as WrapOptions);
      const gd = new GeneDream(dreamEngine.getGeneMap(), {
        minGenes: 1, minNewRepairs: 0, minHoursSinceLastDream: 0,
        onDream: (e) => {
          const icons: Record<string, string> = { start: '🌙', cluster: '📊', prune: '✂️', consolidate: '🔗', enrich: '✨', reindex: '📇', complete: '✅' };
          console.log(`  ${icons[e.stage] || '·'} ${e.stage}${e.detail ? ': ' + e.detail : ''}`);
        },
      });
      console.log('\n  ╔═══════════════════════════════╗');
      console.log('  ║  GENE DREAM CYCLE             ║');
      console.log('  ╚═══════════════════════════════╝\n');
      try {
        const stats = await gd.dream(true);
        console.log(`\n  Dream complete:`);
        console.log(`    Clusters:      ${stats.clustersFound}`);
        console.log(`    Pruned:        ${stats.genesPruned}`);
        console.log(`    Consolidated:  ${stats.genesConsolidated}`);
        console.log(`    Enriched:      ${stats.genesEnriched}`);
        console.log(`    Before→After:  ${stats.beforeCount} → ${stats.afterCount}`);
        console.log(`    Duration:      ${stats.durationMs}ms\n`);
      } catch (e: any) { console.log(`  ✗ ${e.message}\n`); }
      dreamEngine.getGeneMap().close();
      break;
    }
    case 'serve': {
      const portIdx = process.argv.indexOf('--port');
      const port = portIdx !== -1 ? parseInt(process.argv[portIdx + 1]) || 7842 : parseInt(process.env.PORT || '') || 7842;
      const modeIdx = process.argv.indexOf('--mode');
      const mode = modeIdx !== -1 ? process.argv[modeIdx + 1] as 'observe' | 'auto' | 'full' : 'observe';
      const { createApiServer } = await import('./api-server.js');
      const api = createApiServer({ port, mode });
      await api.start();
      break;
    }
    case 'help': case '--help': case '-h': case undefined: printHelp(); break;
    default: console.error(`Unknown command: ${command}`); printHelp(); process.exit(1);
  }
})();
