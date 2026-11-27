import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp, type TestContext } from './helpers.ts';

/** What every answer tells the browser about how to treat it. */
describe('security headers', () => {
  let t: TestContext;
  let https: TestContext;

  beforeAll(async () => {
    t = await startApp();
    https = await startApp({ PUBLIC_URL: 'https://gameweld.example.com' });
  });
  afterAll(async () => {
    await https.close();
    await t.close();
  });

  it('come with answers of the API and with its refusals', async () => {
    for (const url of ['/api/health', '/api/projects', '/api/no-such-route']) {
      const res = await t.app.inject({ method: 'GET', url });
      expect(res.headers['x-content-type-options'], url).toBe('nosniff');
      expect(res.headers['x-frame-options'], url).toBe('DENY');
      expect(res.headers['referrer-policy'], url).toBe('same-origin');
      const policy = String(res.headers['content-security-policy']);
      expect(policy, url).toContain("script-src 'self'");
      expect(policy, url).toContain("frame-ancestors 'none'");
      expect(policy, url).not.toContain('unsafe-eval');
    }
  });

  it('tell the browser to keep to HTTPS only where the instance is served over it', async () => {
    const plain = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(plain.headers['strict-transport-security']).toBeUndefined();
    const secure = await https.app.inject({ method: 'GET', url: '/api/health' });
    expect(secure.headers['strict-transport-security']).toBe('max-age=31536000');
  });
});
