/**
 * LLM Fallback — Classifies unknown errors when string matching fails.
 * Supports Anthropic Claude and OpenAI GPT. Results cached in Gene Map.
 */

import type { FailureClassification, ErrorCode, FailureCategory, Severity, Platform } from './types.js';

export interface LlmConfig {
  /** Primary provider. Default: 'anthropic' */
  provider?: 'anthropic' | 'openai';
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  enabled?: boolean;
  /** Fallback API key (OpenAI). Used when primary (Claude) fails. */
  fallbackApiKey?: string;
}

const CODES: ErrorCode[] = ['verification-failed', 'payment-insufficient', 'rate-limited', 'timeout', 'tx-reverted', 'method-unsupported', 'policy-violation', 'token-uninitialized', 'server-error', 'malformed-credential', 'invalid-challenge', 'unknown'];
const CATS: FailureCategory[] = ['signature', 'balance', 'auth', 'service', 'batch', 'currency', 'policy', 'network', 'session', 'dex', 'compliance', 'unknown'];
const SEVS: Severity[] = ['low', 'medium', 'high', 'critical'];

const SYSTEM = `You classify payment/blockchain errors for AI agents. Respond with ONLY valid JSON, no markdown:
{"code":"<one of: ${CODES.join(', ')}>","category":"<one of: ${CATS.join(', ')}>","severity":"<low|medium|high|critical>","reasoning":"one sentence"}

Guide:
- nonce/signature/verification → verification-failed + signature
- insufficient funds/balance → payment-insufficient + balance
- 429/rate limit → rate-limited + auth
- timeout/ETIMEDOUT → timeout + service
- reverted/out of gas → tx-reverted + batch
- policy/spending limit → policy-violation + policy
- wrong network/chain → token-uninitialized + network
- session/expired → invalid-challenge + session
- 500/502/503 → server-error + service
- malformed/invalid params → malformed-credential + service`;

export async function llmClassify(errorMessage: string, config: LlmConfig): Promise<FailureClassification | null> {
  if (config.enabled === false) return null;

  const provider = config.provider ?? 'anthropic';
  const primaryKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.HELIX_LLM_API_KEY;
  const fallbackKey = config.fallbackApiKey ?? process.env.OPENAI_API_KEY;

  if (!primaryKey && !fallbackKey) return null;

  // Try primary (default: Claude)
  if (primaryKey) {
    const result = await tryLlm(errorMessage, provider, primaryKey, config.model, config.timeoutMs);
    if (result) return result;
  }

  // Fallback to the other provider
  if (fallbackKey && provider === 'anthropic') {
    const result = await tryLlm(errorMessage, 'openai', fallbackKey, undefined, config.timeoutMs);
    if (result) return result;
  } else if (fallbackKey && provider === 'openai') {
    const result = await tryLlm(errorMessage, 'anthropic', fallbackKey, undefined, config.timeoutMs);
    if (result) return result;
  }

  return null;
}

async function tryLlm(errorMessage: string, provider: 'anthropic' | 'openai', apiKey: string, model: string | undefined, timeoutMs: number | undefined): Promise<FailureClassification | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? 8000);
  try {
    const text = provider === 'anthropic'
      ? await callAnthropic(errorMessage, apiKey, model, ctrl.signal)
      : await callOpenAI(errorMessage, apiKey, model, ctrl.signal);
    clearTimeout(timer);
    const p = JSON.parse(text.trim().replace(/```json\n?|```/g, ''));
    return {
      code: (CODES.includes(p.code) ? p.code : 'unknown') as ErrorCode,
      category: (CATS.includes(p.category) ? p.category : 'unknown') as FailureCategory,
      severity: (SEVS.includes(p.severity) ? p.severity : 'medium') as Severity,
      platform: 'generic' as Platform,
      details: errorMessage,
      timestamp: Date.now(),
      llmClassified: true,
      llmReasoning: p.reasoning ?? '',
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function callAnthropic(msg: string, key: string, model: string | undefined, signal: AbortSignal): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model ?? 'claude-sonnet-4-20250514', max_tokens: 150, system: SYSTEM, messages: [{ role: 'user', content: `Classify this error:\n"${msg}"` }] }),
    signal,
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? '';
}

async function callOpenAI(msg: string, key: string, model: string | undefined, signal: AbortSignal): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: model ?? 'gpt-4o-mini', max_tokens: 150, temperature: 0, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Classify this error:\n"${msg}"` }] }),
    signal,
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const d = await r.json() as { choices?: { message: { content: string } }[] };
  return d.choices?.[0]?.message?.content ?? '';
}

export async function llmGenerateReasoning(errorMessage: string, strategy: string, config: LlmConfig): Promise<string | null> {
  if (config.enabled === false) return null;
  const provider = config.provider ?? 'anthropic';
  const key = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.HELIX_LLM_API_KEY;
  if (!key) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs ?? 8000);
  const userMsg = `Error: "${errorMessage}"\nRepaired with: "${strategy}"\nIn one plain-text sentence (no JSON, no markdown), explain WHY this strategy fixes this error.`;
  const sysMsg = 'You explain why a repair strategy works for a given error. Respond with ONE plain-text sentence only. No JSON, no markdown, no quotes.';

  try {
    let text: string;
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.model ?? 'claude-sonnet-4-20250514', max_tokens: 150, system: sysMsg, messages: [{ role: 'user', content: userMsg }] }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json() as { content?: { text: string }[] };
      text = d.content?.[0]?.text ?? '';
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: config.model ?? 'gpt-4o-mini', max_tokens: 150, temperature: 0, messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }] }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json() as { choices?: { message: { content: string } }[] };
      text = d.choices?.[0]?.message?.content ?? '';
    }
    clearTimeout(timer);
    const cleaned = text.trim().replace(/^["']|["']$/g, '').replace(/```\w*\n?|```/g, '').trim().slice(0, 300);
    return cleaned.length > 10 ? cleaned : null;
  } catch { clearTimeout(timer); return null; }
}
