/**
 * Self-Play Evolution — challenger/repair/verifier autonomous loop.
 * Generates mutated errors, tests PCEC, records weaknesses.
 */
import type Database from 'better-sqlite3';
import { matchErrorSignature } from './error-embedding.js';

export interface Challenge {
  id: string; errorMessage: string; platform: string;
  expectedCategory: string; difficulty: 'easy' | 'medium' | 'hard';
  mutationType: 'keyword-swap' | 'platform-transfer' | 'error-combine' | 'synonym' | 'novel';
  sourceGene?: string;
}

export interface RepairAttempt {
  challengeId: string; strategy: string; code: string; category: string;
  confidence: number; durationMs: number; source: string;
}

export interface SelfPlayResult { challenge: Challenge; attempt: RepairAttempt | null; verified: boolean; weakness?: string }
export interface SelfPlaySession { rounds: number; completed: number; repaired: number; failed: number; weaknesses: string[]; durationMs: number }

const SYNONYMS: Record<string, string[]> = {
  mismatch: ['desync', 'conflict', 'inconsistency', 'divergence'],
  failed: ['error', 'rejected', 'denied', 'aborted'],
  invalid: ['malformed', 'incorrect', 'bad', 'wrong'],
  exceeded: ['over-limit', 'surpassed', 'overflow', 'breached'],
  expired: ['timeout', 'stale', 'outdated', 'lapsed'],
  insufficient: ['low', 'not-enough', 'deficit', 'depleted'],
  nonce: ['sequence', 'counter', 'tx-index'],
  gas: ['fee', 'computation-cost', 'execution-fee'],
  reverted: ['rolled-back', 'undone', 'cancelled'],
  limit: ['cap', 'ceiling', 'maximum', 'threshold'],
};
const PLATFORMS = ['tempo', 'coinbase', 'privy', 'generic'];

const NOVEL_ERRORS = [
  { msg: 'transaction underpriced: replacement fee too low', cat: 'gas' },
  { msg: 'intrinsic gas too low for transaction execution', cat: 'gas' },
  { msg: 'paymaster deposit insufficient for operation', cat: 'balance' },
  { msg: 'wallet session token revoked by provider', cat: 'session' },
  { msg: 'cross-chain bridge timeout after 120 seconds', cat: 'service' },
  { msg: 'ERC20 transfer amount exceeds allowance', cat: 'balance' },
  { msg: 'mempool congestion: transaction not propagated', cat: 'network' },
  { msg: 'contract execution halted: out of gas at opcode CALL', cat: 'gas' },
  { msg: 'bundler rejected UserOp: signature validation failed', cat: 'signature' },
  { msg: 'sender account not recognized by network', cat: 'auth' },
];

export class SelfPlayEngine {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS self_play_history (id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id TEXT NOT NULL, error_message TEXT NOT NULL, platform TEXT, difficulty TEXT, mutation_type TEXT, strategy_used TEXT, repaired INTEGER DEFAULT 0, verified INTEGER DEFAULT 0, weakness TEXT, played_at INTEGER DEFAULT (unixepoch()))`);
  }

  generateChallenge(): Challenge {
    const genes = this.db.prepare('SELECT failure_code, category, strategy, q_value, platforms FROM genes ORDER BY RANDOM() LIMIT 10').all() as any[];
    if (genes.length === 0) return this.novelChallenge();
    const r = Math.random();
    if (r < 0.35) return this.keywordSwap(genes);
    if (r < 0.6) return this.platformTransfer(genes);
    if (r < 0.8) return this.errorCombine(genes);
    if (r < 0.95) return this.synonymReplace(genes);
    return this.novelChallenge();
  }

  private makeId(): string { return `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  private keywordSwap(genes: any[]): Challenge {
    const g = genes[Math.floor(Math.random() * genes.length)];
    let msg = g.failure_code.split('-').map((w: string) => { const s = SYNONYMS[w.toLowerCase()]; return s && Math.random() > 0.5 ? s[Math.floor(Math.random() * s.length)] : w; }).join(' ');
    if (msg === g.failure_code.replace(/-/g, ' ')) msg += ' error';
    return { id: this.makeId(), errorMessage: msg, platform: this.randPlatform(g), expectedCategory: g.category, difficulty: 'easy', mutationType: 'keyword-swap', sourceGene: g.failure_code };
  }

  private platformTransfer(genes: any[]): Challenge {
    const g = genes[Math.floor(Math.random() * genes.length)];
    const tp = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
    const prefixes: Record<string, string> = { coinbase: 'CDP Error: ', privy: 'Embedded wallet error: ', tempo: 'MPP transaction failed: ', generic: '' };
    return { id: this.makeId(), errorMessage: (prefixes[tp] || '') + g.failure_code.replace(/-/g, ' '), platform: tp, expectedCategory: g.category, difficulty: 'medium', mutationType: 'platform-transfer', sourceGene: g.failure_code };
  }

  private errorCombine(genes: any[]): Challenge {
    if (genes.length < 2) return this.keywordSwap(genes);
    const [a, b] = [genes[0], genes[1]];
    const combiners = ['during', 'caused by', 'followed by'];
    const msg = `${a.failure_code.replace(/-/g, ' ')} ${combiners[Math.floor(Math.random() * combiners.length)]} ${b.failure_code.replace(/-/g, ' ')}`;
    return { id: this.makeId(), errorMessage: msg, platform: this.randPlatform(a), expectedCategory: a.category, difficulty: 'hard', mutationType: 'error-combine', sourceGene: `${a.failure_code}+${b.failure_code}` };
  }

  private synonymReplace(genes: any[]): Challenge {
    const g = genes[Math.floor(Math.random() * genes.length)];
    const msg = g.failure_code.split('-').map((w: string) => { const s = SYNONYMS[w.toLowerCase()]; return s ? s[Math.floor(Math.random() * s.length)] : w; }).join(' ');
    return { id: this.makeId(), errorMessage: msg, platform: this.randPlatform(g), expectedCategory: g.category, difficulty: 'easy', mutationType: 'synonym', sourceGene: g.failure_code };
  }

  private novelChallenge(): Challenge {
    const n = NOVEL_ERRORS[Math.floor(Math.random() * NOVEL_ERRORS.length)];
    return { id: this.makeId(), errorMessage: n.msg, platform: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)], expectedCategory: n.cat, difficulty: 'hard', mutationType: 'novel' };
  }

  private randPlatform(g: any): string {
    try { const p = JSON.parse(g.platforms || '[]'); if (p.length) return p[Math.floor(Math.random() * p.length)]; } catch {}
    return PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
  }

  attemptRepair(challenge: Challenge): RepairAttempt | null {
    const start = Date.now();
    // Try Gene Map lookup
    const gene = this.db.prepare('SELECT * FROM genes WHERE failure_code = ? OR category = ? ORDER BY q_value DESC LIMIT 1').get(challenge.expectedCategory, challenge.expectedCategory) as any;
    if (gene) {
      return { challengeId: challenge.id, strategy: gene.strategy, code: gene.failure_code, category: gene.category, confidence: gene.q_value, durationMs: Date.now() - start, source: 'gene-map' };
    }
    // Try error embedding
    const match = matchErrorSignature(challenge.errorMessage);
    if (match) {
      return { challengeId: challenge.id, strategy: 'unknown', code: match.failureCode, category: match.failureCategory, confidence: match.similarity, durationMs: Date.now() - start, source: 'embedding' };
    }
    return null;
  }

  verify(challenge: Challenge, attempt: RepairAttempt): boolean {
    if (attempt.category === challenge.expectedCategory) return true;
    const map: Record<string, string[]> = {
      nonce: ['refresh_nonce', 'remove_and_resubmit'], gas: ['speed_up_transaction', 'reduce_request', 'backoff_retry'],
      balance: ['reduce_request', 'split_transaction'], 'rate-limited': ['backoff_retry'], session: ['renew_session'],
      service: ['backoff_retry', 'retry_with_receipt'], policy: ['reduce_request', 'split_transaction'],
      signature: ['refresh_nonce', 'fix_params'], auth: ['renew_session', 'backoff_retry'], network: ['backoff_retry', 'switch_network'],
    };
    return (map[challenge.expectedCategory] || []).includes(attempt.strategy);
  }

  async playRound(): Promise<SelfPlayResult> {
    const challenge = this.generateChallenge();
    const attempt = this.attemptRepair(challenge);
    let verified = false, weakness: string | undefined;
    if (attempt) { verified = this.verify(challenge, attempt); if (!verified) weakness = `Wrong repair for "${challenge.errorMessage}" (expected: ${challenge.expectedCategory}, got: ${attempt.category}/${attempt.strategy})`; }
    else weakness = `No strategy for "${challenge.errorMessage}" (expected: ${challenge.expectedCategory})`;
    this.db.prepare('INSERT INTO self_play_history (challenge_id, error_message, platform, difficulty, mutation_type, strategy_used, repaired, verified, weakness) VALUES (?,?,?,?,?,?,?,?,?)').run(challenge.id, challenge.errorMessage, challenge.platform, challenge.difficulty, challenge.mutationType, attempt?.strategy ?? null, attempt ? 1 : 0, verified ? 1 : 0, weakness ?? null);
    return { challenge, attempt, verified, weakness };
  }

  async runSession(rounds: number): Promise<SelfPlaySession> {
    const start = Date.now();
    let completed = 0, repaired = 0, failed = 0;
    const weaknesses: string[] = [];
    for (let i = 0; i < rounds; i++) { try { const r = await this.playRound(); completed++; if (r.verified) repaired++; else { failed++; if (r.weakness) weaknesses.push(r.weakness); } } catch { completed++; failed++; } }
    return { rounds, completed, repaired, failed, weaknesses, durationMs: Date.now() - start };
  }

  getHistory(limit = 50): any[] { return this.db.prepare('SELECT * FROM self_play_history ORDER BY played_at DESC LIMIT ?').all(limit); }

  getStats() {
    const t = (this.db.prepare('SELECT COUNT(*) as c FROM self_play_history').get() as any).c;
    const r = (this.db.prepare('SELECT COUNT(*) as c FROM self_play_history WHERE verified = 1').get() as any).c;
    const w = (this.db.prepare('SELECT COUNT(*) as c FROM self_play_history WHERE weakness IS NOT NULL').get() as any).c;
    return { total: t, repaired: r, failed: t - r, successRate: t > 0 ? Math.round(r / t * 100) / 100 : 0, weaknesses: w };
  }
}
