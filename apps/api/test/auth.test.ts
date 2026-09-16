import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('mock sign-in (T1)', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('advertises the mock provider and its personas', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mock.enabled).toBe(true);
    expect(body.mock.personas.map((p: { key: string }) => p.key)).toEqual([
      'director',
      'developer',
      'tester',
    ]);
  });

  it('is anonymous until a persona signs in', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('null');
    const projects = await t.app.inject({ method: 'GET', url: '/api/projects' });
    expect(projects.statusCode).toBe(401);
  });

  it('signs in a persona, reports it, and signs out', async () => {
    const cookie = await signInAs(t.app, 'developer');
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.json()).toMatchObject({ displayName: 'Devin Developer', provider: 'mock' });

    const out = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie },
    });
    expect(out.statusCode).toBe(204);
    const after = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(after.body).toBe('null');
  });

  it('rejects unknown personas', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/mock/sign-in',
      payload: { persona: 'nobody' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('mock sign-in disabled', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await startApp({ AUTH_MOCK: 'false' });
  });
  afterAll(async () => {
    await t.close();
  });

  it('does not advertise the provider and the route does not exist', async () => {
    const providers = await t.app.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(providers.json().mock).toEqual({ enabled: false, personas: [] });
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/mock/sign-in',
      payload: { persona: 'director' },
    });
    expect(res.statusCode).toBe(404);
  });
});
