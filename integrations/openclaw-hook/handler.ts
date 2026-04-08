/**
 * Vial Self-Healing Hook v0.3
 *
 * Protocols: 1 (loop), 3 (rate), 4 (auth), 5 (timeout), 8 (role)
 * Injection: openclaw agent --message (no external API needed)
 */

import { execSync } from 'child_process';
import { appendFileSync, readFileSync, existsSync } from 'fs';

const TELEMETRY = 'https://helix-telemetry.haimobai-adrian.workers.dev/v1/event';
const VIAL_LOG = '/tmp/vial.log';
const ORCHESTRATOR_AGENTS = ['main', 'orchestrator', 'coordinator'];
const FORBIDDEN_TOOLS = ['exec', 'write', 'edit', 'browser', 'message'];

const sessions = new Map<string, { textOnlyTurns: number; lastActivity: number; agentId: string; isOrchestrator: boolean }>();

function vialLog(msg: string) { try { appendFileSync(VIAL_LOG, `${msg}|${Math.floor(Date.now() / 1000)}\n`); } catch {} }

async function telem(ec: string, ok: boolean) {
  try { await fetch(TELEMETRY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ e: 'vial_repair', ec, ok, src: 'clawdi_hook_v3' }) }); } catch {}
}

function inject(agentId: string, message: string) {
  try { execSync(`openclaw agent --agent "${agentId}" --message "${message.replace(/"/g, "'")}" --json 2>/dev/null`, { timeout: 8000, stdio: 'ignore' }); vialLog(`VIAL_INJECT|${agentId}|ok`); }
  catch { vialLog(`VIAL_INJECT|${agentId}|failed`); }
}

function isOrchestrator(agentId: string): boolean {
  try {
    const p = `/root/.openclaw/workspace-${agentId}/IDENTITY.md`;
    if (existsSync(p)) { const c = readFileSync(p, 'utf8').toLowerCase(); return c.includes('orchestrat') || c.includes('coordinator'); }
  } catch {}
  return ORCHESTRATOR_AGENTS.includes(agentId);
}

export default {
  name: 'vial-self-healing',
  version: '0.3.0',

  register(api: any) {
    console.log('[Vial] Hook v0.3 registering...');

    api.hooks?.on('after_tool_call', async (ctx: any) => {
      const sessionKey = ctx.sessionKey || 'unknown';
      const agentId = ctx.agentId || 'main';
      const toolName = ctx.toolName || 'unknown';
      const result = JSON.stringify(ctx.result || '').toLowerCase();

      const state = sessions.get(sessionKey);
      if (state) { state.textOnlyTurns = 0; state.lastActivity = Date.now(); }

      // Protocol 8: role enforcement
      if (isOrchestrator(agentId) && FORBIDDEN_TOOLS.includes(toolName)) {
        vialLog(`VIAL_8_ROLE|${agentId}|${toolName}|forbidden`);
        await telem('role_drift', false);
        inject(agentId, `[VIAL Protocol 8] Role violation: you are orchestrator and called ${toolName} directly. STOP. Delegate via sessions_spawn to the correct specialist agent.`);
        return;
      }

      // Protocol 4: auth
      if (result.includes('401') || result.includes('unauthorized') || result.includes('token expired') || result.includes('403')) {
        vialLog(`VIAL_4_AUTH|${agentId}|${toolName}`);
        await telem('auth_401', false);
        inject(agentId, `[VIAL Protocol 4] Auth error on ${toolName}. Classify: expired token → re-auth via connector. Missing scope → inform user. Generic 401 → check connector settings.`);
      }

      // Protocol 3: rate limit
      if (result.includes('429') || result.includes('rate limit') || result.includes('quota exceeded')) {
        vialLog(`VIAL_3_RATE|${agentId}|${toolName}`);
        await telem('rate_429', false);
        inject(agentId, `[VIAL Protocol 3] Rate limit on ${toolName}. Wait 30 seconds then retry once.`);
      }

      // Protocol 5: timeout
      if (result.includes('timeout') || result.includes('econnreset') || result.includes('disconnected')) {
        vialLog(`VIAL_5_SESSION|${agentId}|${toolName}`);
        await telem('timeout', false);
        inject(agentId, `[VIAL Protocol 5] Connection error on ${toolName}. Wait 5 seconds and retry once silently.`);
      }
    });

    api.hooks?.on('agent:turn:complete', async (ctx: any) => {
      const sessionKey = ctx.sessionKey || 'unknown';
      const agentId = ctx.agentId || 'main';
      const hadTools = (ctx.toolCalls || []).length > 0;

      if (!sessions.has(sessionKey)) sessions.set(sessionKey, { textOnlyTurns: 0, lastActivity: Date.now(), agentId, isOrchestrator: isOrchestrator(agentId) });
      const state = sessions.get(sessionKey)!;
      state.lastActivity = Date.now();

      if (!hadTools) {
        state.textOnlyTurns++;
        if (state.textOnlyTurns >= 2) {
          vialLog(`VIAL_1_LOOP|${agentId}|turns=${state.textOnlyTurns}`);
          await telem('loop_detected', false);
          inject(agentId, `[VIAL Protocol 1] Loop detected: ${state.textOnlyTurns} text-only turns. STOP explaining. Execute the pending task NOW.`);
          state.textOnlyTurns = 0;
        }
      } else { state.textOnlyTurns = 0; }
    });

    api.hooks?.on('agent:bootstrap', (ctx: any) => {
      const agentId = ctx.agentId || 'main';
      sessions.set(ctx.sessionKey || 'unknown', { textOnlyTurns: 0, lastActivity: Date.now(), agentId, isOrchestrator: isOrchestrator(agentId) });
    });

    setInterval(() => { const c = Date.now() - 7200000; for (const [k, s] of sessions.entries()) if (s.lastActivity < c) sessions.delete(k); }, 1800000);

    console.log('[Vial] Hook v0.3 ready — Protocols 1,3,4,5,8');
  },
};
