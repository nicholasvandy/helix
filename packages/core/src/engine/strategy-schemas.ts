import { z } from 'zod';

export const STRATEGY_SCHEMAS: Record<string, z.ZodSchema> = {
  backoff_retry: z.object({ defaultDelayMs: z.number().min(100).max(30000).optional(), retryAfter: z.number().optional() }).passthrough(),
  reduce_request: z.object({ amount: z.number().optional(), availableBalance: z.number().optional() }).passthrough(),
  refresh_nonce: z.object({ walletAddress: z.string().startsWith('0x').optional(), chainNonce: z.number().optional() }).passthrough(),
  switch_network: z.object({ targetChainId: z.number().optional(), targetRpcUrl: z.string().url().optional() }).passthrough(),
  swap_currency: z.object({ tokenIn: z.string().startsWith('0x').optional(), tokenOut: z.string().startsWith('0x').optional(), amount: z.string().optional(), maxSlippage: z.number().min(0).max(0.5).optional() }).passthrough(),
  split_transaction: z.object({ amount: z.string().optional(), limit: z.string().optional(), to: z.string().startsWith('0x').optional() }).passthrough(),
  speed_up_transaction: z.object({ txHash: z.string().startsWith('0x').optional(), nonce: z.number().optional(), to: z.string().startsWith('0x').optional() }).passthrough(),
  self_pay_gas: z.object({ to: z.string().startsWith('0x').optional(), value: z.string().optional(), data: z.string().optional() }).passthrough(),
};

export function validateStrategyParams(
  strategy: string,
  params: Record<string, unknown>,
): { valid: true; data: Record<string, unknown> } | { valid: false; error: string } {
  const schema = STRATEGY_SCHEMAS[strategy];
  if (!schema) return { valid: true, data: params };
  const result = schema.safeParse(params);
  if (result.success) return { valid: true, data: result.data as Record<string, unknown> };
  return { valid: false, error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') };
}
