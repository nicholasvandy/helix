# @helix-agent/api — MPP Payment Repair Service

Helix as an MPP-compatible API service. Any AI agent on the MPP network can call Helix to diagnose and repair payment failures — no npm install required, just an HTTP call.

## Quick Start

```bash
npm run api
# Or: HELIX_WALLET=0xYour HELIX_NETWORK=eip155:8453 npm run api
```

## Endpoints

### Paid (MPP 402)

```bash
# Diagnose — $0.001/call
curl -X POST http://localhost:3402/v1/diagnose \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <mpp-payment>" \
  -d '{"error": "AA25 Invalid account nonce"}'

# Repair — $0.001/call
curl -X POST http://localhost:3402/v1/repair \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <mpp-payment>" \
  -d '{"error": "429 Too Many Requests"}'
```

### Free

```bash
curl http://localhost:3402/v1/check/verification-failed/signature
curl http://localhost:3402/v1/status
curl http://localhost:3402/v1/platforms
curl http://localhost:3402/health
curl http://localhost:3402/.well-known/mpp
```

## For mppscan Listing

1. Deploy to a public URL
2. Register at mppscan.com
3. mppscan reads `/.well-known/mpp` for service metadata

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3402 | Server port |
| HELIX_WALLET | 0x000...000 | Payment recipient wallet |
| HELIX_NETWORK | eip155:84532 | CAIP-2 network ID |
| HELIX_FACILITATOR | x402.org | x402 facilitator URL |
