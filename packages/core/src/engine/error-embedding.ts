/**
 * Error Embedding — local token-based semantic error matching.
 * No external API required.
 */

export interface ErrorSignature {
  tokens: string[];
  weights?: number[];
  failureCode: string;
  failureCategory: string;
  minSimilarity?: number;
}

export interface EmbeddingMatch {
  failureCode: string;
  failureCategory: string;
  similarity: number;
  matchedSignature: string[];
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from',
  'error', 'failed', 'invalid', 'unexpected', 'unable',
  'not', 'was', 'has', 'been', 'are', 'were',
  'but', 'please', 'try', 'again', 'could', 'should',
]);

const DEFAULT_THRESHOLD = 0.4;

/** Lowercase, strip special chars, remove short tokens (<3 chars) and stop words. */
export function tokenize(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Weighted token overlap score 0-1.
 * For each signature token, check if any message token contains it or vice versa.
 */
export function tokenSimilarity(messageTokens: string[], signature: ErrorSignature): number {
  const { tokens, weights } = signature;
  if (tokens.length === 0) return 0;

  const totalWeight = weights
    ? weights.reduce((s, w) => s + w, 0)
    : tokens.length;

  let matchedWeight = 0;
  for (let i = 0; i < tokens.length; i++) {
    const sigToken = tokens[i];
    const weight = weights?.[i] ?? 1;
    const matched = messageTokens.some(
      mt => mt.includes(sigToken) || sigToken.includes(mt),
    );
    if (matched) matchedWeight += weight;
  }

  return totalWeight === 0 ? 0 : matchedWeight / totalWeight;
}

// ── Known signatures ──────────────────────────────────────────────────────────

let _signatures: ErrorSignature[] = [
  // Nonce
  { tokens: ['nonce', 'mismatch'], failureCode: 'nonce-mismatch', failureCategory: 'nonce' },
  { tokens: ['aa25', 'nonce'], weights: [3, 2], failureCode: 'nonce-mismatch', failureCategory: 'nonce' },

  // Balance
  { tokens: ['insufficient', 'funds'], failureCode: 'payment-insufficient', failureCategory: 'balance' },
  { tokens: ['insufficient', 'balance'], failureCode: 'payment-insufficient', failureCategory: 'balance' },

  // Gas
  { tokens: ['gas', 'estimation'], failureCode: 'gas-estimation-failed', failureCategory: 'gas' },
  { tokens: ['gas', 'too', 'low'], failureCode: 'gas-estimation-failed', failureCategory: 'gas' },
  { tokens: ['underpriced'], failureCode: 'gas-estimation-failed', failureCategory: 'gas' },

  // Rate limit
  { tokens: ['rate', 'limit'], failureCode: 'rate-limited', failureCategory: 'auth' },
  { tokens: ['429', 'too', 'many'], failureCode: 'rate-limited', failureCategory: 'auth' },
  { tokens: ['throttl'], failureCode: 'rate-limited', failureCategory: 'auth' },

  // Session
  { tokens: ['session', 'expired'], failureCode: 'session-expired', failureCategory: 'auth' },
  { tokens: ['session', 'invalid'], failureCode: 'session-expired', failureCategory: 'auth' },

  // Timeout
  { tokens: ['timeout'], failureCode: 'timeout', failureCategory: 'service' },
  { tokens: ['timed', 'out'], failureCode: 'timeout', failureCategory: 'service' },
  { tokens: ['deadline', 'exceeded'], failureCode: 'timeout', failureCategory: 'service' },

  // Revert
  { tokens: ['execution', 'reverted'], failureCode: 'execution-reverted', failureCategory: 'contract' },
  { tokens: ['revert'], failureCode: 'execution-reverted', failureCategory: 'contract' },
  { tokens: ['useroperation', 'reverted'], failureCode: 'execution-reverted', failureCategory: 'contract' },

  // Network
  { tokens: ['wrong', 'network'], failureCode: 'wrong-network', failureCategory: 'network' },
  { tokens: ['chain', 'mismatch'], failureCode: 'wrong-network', failureCategory: 'network' },

  // Server
  { tokens: ['500', 'internal', 'server'], failureCode: 'server-error', failureCategory: 'service' },
  { tokens: ['502', 'bad', 'gateway'], failureCode: 'server-error', failureCategory: 'service' },
  { tokens: ['503', 'unavailable'], failureCode: 'server-error', failureCategory: 'service' },

  // x402
  { tokens: ['402', 'payment', 'required'], failureCode: 'x402-payment-failed', failureCategory: 'balance' },
];

/**
 * Find the best matching known signature.
 * Returns null if the best score is below the threshold (default 0.4).
 */
export function matchErrorSignature(errorMessage: string): EmbeddingMatch | null {
  const messageTokens = tokenize(errorMessage);
  if (messageTokens.length === 0) return null;

  let bestScore = 0;
  let bestSig: ErrorSignature | null = null;

  for (const sig of _signatures) {
    const score = tokenSimilarity(messageTokens, sig);
    const threshold = sig.minSimilarity ?? DEFAULT_THRESHOLD;
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestSig = sig;
    }
  }

  if (!bestSig) return null;

  return {
    failureCode: bestSig.failureCode,
    failureCategory: bestSig.failureCategory,
    similarity: bestScore,
    matchedSignature: bestSig.tokens,
  };
}

/** Add a custom signature at runtime. */
export function addSignature(sig: ErrorSignature): void {
  _signatures.push(sig);
}

/** List all known signatures. */
export function getSignatures(): ErrorSignature[] {
  return [..._signatures];
}
