/**
 * LLM Fallback — Classifies unknown errors when string matching fails.
 * Supports Anthropic Claude and OpenAI GPT. Results cached in Gene Map.
 */

import type { FailureClassification, ErrorCode, FailureCategory, Severity, Platform } from './types.js';

export interface LlmConfig {
  provider: 'anthropic' | 'openai';
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  enabled?: boolean;
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
  const apiKey = config.apiKey ?? process.env.HELIX_LLM_API_KEY;
  if (!apiKey || config.enabled === false) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.timeoutMs ?? 2000);

  try {
    const text = config.provider === 'anthropic'
      ? await callAnthropic(errorMessage, apiKey, config.model, ctrl.signal)
      : await callOpenAI(errorMessage, apiKey, config.model, ctrl.signal);

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
  const apiKey = config.apiKey ?? process.env.HELIX_LLM_API_KEY;
  if (!apiKey || config.enabled === false) return null;
  const prompt = `Error: "${errorMessage}"\nRepaired with: "${strategy}"\nIn one sentence, explain WHY this strategy works.`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const text = config.provider === 'anthropic' ? await callAnthropic(prompt, apiKey, config.model, ctrl.signal) : await callOpenAI(prompt, apiKey, config.model, ctrl.signal);
    clearTimeout(timer);
    return text.trim().slice(0, 500);
  } catch { clearTimeout(timer); return null; }
}
