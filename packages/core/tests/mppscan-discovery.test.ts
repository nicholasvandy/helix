import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';

const PORT = 17855;
let server: any;

function req(path: string, method = 'GET', body?: string, headers?: Record<string, string>): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = { hostname: '127.0.0.1', port: PORT, path, method, headers: { 'Content-Type': 'application/json', ...headers } };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) h[k] = String(v);
        try { resolve({ status: res.statusCode!, headers: h, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode!, headers: h, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

describe('MPPScan Discovery', () => {
  beforeAll(async () => {
    const { createApiServer } = await import('../src/api-server.js');
    server = createApiServer({ port: PORT, mode: 'observe' });
    await server.start();
  });

  afterAll(async () => {
    if (server?.stop) await server.stop();
  });

  test('GET /openapi.json returns valid OpenAPI 3.1.0', async () => {
    const { status, body } = await req('/openapi.json');
    expect(status).toBe(200);
    expect(body.openapi).toBe('3.1.0');
    expect(body.info.title).toContain('Helix');
    expect(body.info['x-guidance']).toBeTruthy();
    expect(body['x-discovery']).toBeTruthy();
  });

  test('/heal path has x-payment-info and 402 response', async () => {
    const { body } = await req('/openapi.json');
    const heal = body.paths['/heal'].post;
    expect(heal['x-payment-info']).toBeTruthy();
    expect(heal['x-payment-info'].protocols).toContain('mpp');
    expect(heal['x-payment-info'].mpp.pricingMode).toBe('fixed');
    expect(heal.responses['402']).toBeTruthy();
    expect(heal.requestBody).toBeTruthy();
  });

  test('/observe path has x-payment-info and 402 response', async () => {
    const { body } = await req('/openapi.json');
    const observe = body.paths['/observe'].post;
    expect(observe['x-payment-info']).toBeTruthy();
    expect(observe.responses['402']).toBeTruthy();
    expect(observe.requestBody).toBeTruthy();
  });

  test('/gene-map path exists with GET', async () => {
    const { body } = await req('/openapi.json');
    expect(body.paths['/gene-map'].get).toBeTruthy();
    expect(body.paths['/gene-map'].get.operationId).toBe('getGeneMap');
  });

  test('POST /heal without payment → 402 + WWW-Authenticate', async () => {
    const { status, headers } = await req('/heal', 'POST', JSON.stringify({ transaction: { to: '0x1', value: '1', chainId: 8453 }, error: 'test' }));
    expect(status).toBe(402);
    expect(headers['www-authenticate']).toContain('Payment');
    expect(headers['www-authenticate']).toContain('method="tempo"');
    expect(headers['www-authenticate']).toContain('realm=');
  });

  test('POST /observe without payment → 402 + WWW-Authenticate', async () => {
    const { status, headers } = await req('/observe', 'POST', JSON.stringify({ transaction: {}, chainId: 8453 }));
    expect(status).toBe(402);
    expect(headers['www-authenticate']).toContain('Payment');
    expect(headers['www-authenticate']).toContain('method="tempo"');
  });

  test('POST /heal with payment header → 200', async () => {
    const { status, body } = await req('/heal', 'POST',
      JSON.stringify({ transaction: { to: '0x1234', value: '1000', chainId: 8453 }, error: 'nonce too low' }),
      { 'x-payment': 'mpp-token-test' },
    );
    expect(status).toBe(200);
    expect(body.repaired).toBeTruthy();
    expect(body.diagnosis).toBeTruthy();
    expect(body.strategy).toBeTruthy();
    expect(typeof body.confidence).toBe('number');
  });

  test('GET /gene-map returns gene map data', async () => {
    const { status, body } = await req('/gene-map');
    expect(status).toBe(200);
    expect(typeof body.totalGenes).toBe('number');
    expect(Array.isArray(body.topPatterns)).toBe(true);
    expect(typeof body.successRate).toBe('number');
  });
});
