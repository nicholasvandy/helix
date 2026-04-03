/**
 * Calculate USD cost from token usage.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

// Price per million tokens: [input, output]
const MODEL_PRICES: Record<string, [number, number]> = {
  'claude-sonnet-4-20250514': [3, 15],
  'claude-opus-4-20250514': [15, 75],
  'claude-haiku-3-5-20241022': [0.80, 4],
  'claude-sonnet': [3, 15],
  'claude-opus': [15, 75],
  'claude-haiku': [0.80, 4],
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
  'default': [3, 15],
};

function findPrice(model: string): [number, number] {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(MODEL_PRICES)) {
    if (lower.includes(key)) return price;
  }
  return MODEL_PRICES['default'];
}

export function calculateCost(usage: TokenUsage): number {
  const [inputPrice, outputPrice] = findPrice(usage.model);
  return (usage.inputTokens * inputPrice + usage.outputTokens * outputPrice) / 1_000_000;
}
