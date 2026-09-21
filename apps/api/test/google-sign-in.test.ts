import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import type { CustomFetch } from 'openid-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

/**
 * Google sign-in (T1) against a stand-in for Google: its discovery document, token endpoint, and
 * signing keys answer through the fetch the provider is given, with ID tokens signed by a key
 * made for the test. Everything between the browser and the database is the real code.
 */
const ISSUER = 'https://accounts.google.com';
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

interface Person {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
}

class FakeGoogle {
  private readonly key: KeyObject;
  private readonly jwk: Record<string, unknown>;
  private readonly codes = new Map<string, { person: Person; nonce: string }>();
  reachable = true;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.key = privateKey;
    this.jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' };
  }

  /** What Google does when the person picks an account: remembers who, answers with a code. */
  issueCode(person: Person, nonce: string): string {
    const code = randomUUID();
    this.codes.set(code, { person, nonce });
    return code;
  }

  private idToken(person: Person, nonce: string): string {
    const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const input = `${enc({ alg: 'RS256', kid: 'test', typ: 'JWT' })}.${enc({
      iss: ISSUER,
      aud: CLIENT_ID,
      azp: CLIENT_ID,
      iat: now,
      exp: now + 3600,
      nonce,
      email_verified: true,
      ...person,
    })}`;
    return `${input}.${sign('sha256', Buffer.from(input), this.key).toString('base64url')}`;
  }

  fetch: CustomFetch = async (url, options) => {
    if (!this.reachable) throw new TypeError('fetch failed');
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    const { pathname, origin } = new URL(url);
    if (origin === ISSUER && pathname === '/.well-known/openid-configuration')
      return json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/o/oauth2/v2/auth`,
        token_endpoint: 'https://oauth2.googleapis.com/token',
        jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      });
    if (pathname === '/oauth2/v3/certs') return json({ keys: [this.jwk] });
    if (pathname === '/token') {
      const code = new URLSearchParams(String(options.body)).get('code') ?? '';
      const grant = this.codes.get(code);
      if (!grant) return json({ error: 'invalid_grant' }, 400);
      this.codes.delete(code);
      return json({
        access_token: 'access',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: this.idToken(grant.person, grant.nonce),
      });
    }
    return json({ error: 'not_found' }, 404);
  };
}

describe('Google sign-in (T1)', () => {
  let t: TestContext;
  let google: FakeGoogle;
  let director: string;
  let projectId: string;
  const run = randomUUID().slice(0, 8);
  const address = (name: string) => `${name}-${run}@example.com`;

  beforeAll(async () => {
    google = new FakeGoogle();
    t = await startApp(
      {
        PUBLIC_URL: 'http://localhost:8090',
        GOOGLE_CLIENT_ID: CLIENT_ID,
        GOOGLE_CLIENT_SECRET: 'secret',
        INITIAL_ADMIN_EMAIL: address('Owner'),
      },
      { oidcFetch: google.fetch },
    );
    director = await signInAs(t.app, 'director');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Invitations' },
    });
    projectId = created.json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  /** The whole round trip: start, the person choosing an account at Google, the callback. */
  async function signIn(
    person: Person,
    tamper: { state?: string; dropCookie?: boolean } = {},
  ): Promise<{ location: string; cookie: string | null }> {
    const start = await t.app.inject({ method: 'GET', url: '/api/auth/google/start' });
    expect(start.statusCode).toBe(302);
    const to = new URL(start.headers.location as string);
    expect(to.origin + to.pathname).toBe(`${ISSUER}/o/oauth2/v2/auth`);
    expect(to.searchParams.get('redirect_uri')).toBe(
      'http://localhost:8090/api/auth/google/callback',
    );
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    const flow = start.cookies.find((c) => c.name === 'gw_oidc')!;

    const code = google.issueCode(person, to.searchParams.get('nonce')!);
    const query = new URLSearchParams({
      code,
      state: tamper.state ?? to.searchParams.get('state')!,
    });
    const back = await t.app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?${query}`,
      headers: tamper.dropCookie ? {} : { cookie: `gw_oidc=${flow.value}` },
    });
    expect(back.statusCode).toBe(302);
    const session = back.cookies.find((c) => c.name === 'gw_session' && c.value);
    return {
      location: back.headers.location as string,
      cookie: session ? `gw_session=${session.value}` : null,
    };
  }

  async function me(cookie: string) {
    return (await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json();
  }

  it('lists Google among the providers', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(res.json().oidc).toEqual([{ id: 'google', label: 'Google' }]);
  });

  it('refuses someone who was not invited, and makes no account for them', async () => {
    const email = address('stranger');
    const res = await signIn({ sub: `stranger-${run}`, email });
    expect(res.cookie).toBeNull();
    expect(res.location).toBe(`/?auth_error=not_invited&email=${encodeURIComponent(email)}`);
    const users = await t.db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    expect(users.rowCount).toBe(0);
  });

  it('turns an invitation into a membership on the first sign-in with that address', async () => {
    const email = address('artist');
    const invited = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: director },
      payload: { email: email.toUpperCase(), roles: ['developer'], canAccept: true },
    });
    expect(invited.statusCode).toBe(202);
    expect(invited.json()).toMatchObject({
      email,
      roles: ['developer'],
      invitedBy: 'Dana Director',
    });

    // Any Google account: the address is not on any particular domain.
    const res = await signIn({ sub: `artist-${run}`, email, name: 'Ada Artist' });
    expect(res.location).toBe('/');
    expect(await me(res.cookie!)).toMatchObject({
      displayName: 'Ada Artist',
      email,
      provider: 'google',
      isAdmin: false,
    });

    const project = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: { cookie: res.cookie! },
    });
    expect(project.statusCode).toBe(200);
    expect(project.json().roles).toEqual(['developer']);
    expect(project.json().permissions['item.accept']).toBe(true);
    expect(project.json().invitations).toEqual([]);

    const history = await t.db.query<{ action: string; actor: string }>(
      `SELECT a.action, u.display_name AS actor FROM activity a JOIN users u ON u.id = a.actor_id
        WHERE a.project_id = $1 AND a.action IN ('member.invited', 'member.added') ORDER BY a.id`,
      [projectId],
    );
    expect(history.rows).toEqual([
      { action: 'member.invited', actor: 'Dana Director' },
      { action: 'member.added', actor: 'Dana Director' },
    ]);
  });

  it('recognises the same Google account after its address changes', async () => {
    const first = await signIn({ sub: `artist-${run}`, email: address('artist') });
    const renamed = await signIn({ sub: `artist-${run}`, email: address('ada') });
    expect((await me(renamed.cookie!)).id).toBe((await me(first.cookie!)).id);
  });

  it('refuses a new account whose address the provider has not verified', async () => {
    const email = address('unverified');
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: director },
      payload: { email, roles: ['tester'] },
    });
    const res = await signIn({ sub: `unverified-${run}`, email, email_verified: false });
    expect(res.cookie).toBeNull();
    expect(res.location).toMatch(/^\/\?auth_error=email_unverified/);
  });

  it('lets the initial admin in without an invitation, as admin while there is none', async () => {
    await t.db.query('UPDATE users SET is_admin = false');
    const res = await signIn({ sub: `owner-${run}`, email: address('owner') });
    expect(await me(res.cookie!)).toMatchObject({ email: address('owner'), isAdmin: true });
    await t.db.query(`UPDATE users SET is_admin = true WHERE email = 'director@gameweld.local'`);
  });

  it('sends a cancelled sign-in back quietly', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?error=access_denied&state=x',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('refuses a callback that does not match the browser that started it', async () => {
    const person = { sub: `artist-${run}`, email: address('ada') };
    expect((await signIn(person, { dropCookie: true })).location).toBe('/?auth_error=expired');
    const forged = await signIn(person, { state: 'forged' });
    expect(forged.cookie).toBeNull();
    expect(forged.location).toBe('/?auth_error=failed');
  });

  it('says so when Google cannot be reached', async () => {
    const fresh = await startApp(
      {
        PUBLIC_URL: 'http://localhost:8090',
        GOOGLE_CLIENT_ID: CLIENT_ID,
        GOOGLE_CLIENT_SECRET: 'secret',
      },
      { oidcFetch: google.fetch },
    );
    google.reachable = false;
    try {
      const res = await fresh.app.inject({ method: 'GET', url: '/api/auth/google/start' });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/?auth_error=unavailable');
    } finally {
      google.reachable = true;
      await fresh.close();
    }
  });
});
