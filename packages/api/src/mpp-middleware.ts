import type { Request, Response, NextFunction } from 'express';

export interface MppConfig {
  price: string;
  currency: string;
  network: string;
  recipient: string;
  description: string;
  facilitatorUrl?: string;
}

export function mppPaymentRequired(config: MppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const sig = req.headers['payment-signature'] ||
                req.headers['x-payment'] ||
                req.headers['x-payment-receipt'];

    if (!sig) {
      const payload = {
        x402Version: 2,
        error: 'Payment required',
        accepts: [{
          scheme: 'exact',
          network: config.network,
          amount: config.price,
          asset: config.currency,
          payTo: config.recipient,
          maxTimeoutSeconds: 300,
          extra: { name: config.currency, description: config.description },
        }],
      };
      res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(payload)).toString('base64'));
      res.status(402).json(payload);
      return;
    }

    const clientId = req.headers['x-agent-id'] || req.ip || 'unknown';
    console.log(`[helix-api] Payment from ${clientId} for ${req.path}`);

    (req as Request & { mppPayment?: unknown }).mppPayment = {
      signature: sig,
      clientId,
      timestamp: Date.now(),
    };

    next();
  };
}
