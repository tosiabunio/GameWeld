import type { ActivityEntry, ApiToken, CreatedToken, NotificationSummary } from '@gameweld/domain';
import { MAX_TOKENS_PER_USER } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, createContext } from '../src/app.ts';
import { createPool } from '../src/db.ts';
import { seedDemo } from '../src/seed.ts';
import { signInAs, testConfig, type TestContext } from './helpers.ts';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

describe('API tokens', () => {
  let t: TestContext;
  const routes: { method: Method; url: string; readOnlySafe: boolean }[] = [];
  const cookies = { director: '', developer: '' };
  let projectId: string;

  type Who = keyof typeof cookies;
  const withCookie = (who: Who, method: Method, url: string, payload?: object) =>
    t.app.inject({
      method,
      url: `/api${url}`,
      headers: { cookie: cookies[who] },
      ...(payload ? { payload } : {}),
    });
  const withToken = (secret: string, method: Method, url: string, payload?: object) =>
    t.app.inject({
      method,
      url: `/api${url}`,
      headers: { authorization: `Bearer ${secret}` },
      ...(payload ? { payload } : {}),
    });
  const makeToken = async (who: Who, name: string, access: 'read' | 'write') => {
    const res = await withCookie(who, 'POST', '/me/tokens', { name, access });
    expect(res.statusCode, res.body).toBe(201);
    return res.json() as CreatedToken;
  };

  beforeAll(async () => {
    const config = testConfig();
    const db = createPool(config.databaseUrl);
    await seedDemo(db);
    const app = await buildApp(createContext(config, db), (instance) => {
      instance.addHook('onRoute', (r) => {
        for (const m of Array.isArray(r.method) ? r.method : [r.method])
          if (r.url.startsWith('/api/') && m !== 'HEAD')
            routes.push({
              method: m as Method,
              url: r.url,
              readOnlySafe: r.config?.readOnlySafe === true,
            });
      });
    });
    await app.ready();
    t = {
      app,
      db,
      close: async () => {
        await app.close();
        await db.end();
      },
    };
    cookies.director = await signInAs(app, 'director');
    cookies.developer = await signInAs(app, 'developer');
    projectId = (await withCookie('director', 'POST', '/projects', { name: 'Tokens' })).json().id;
    await withCookie('director', 'POST', `/projects/${projectId}/members`, {
      email: 'developer@gameweld.local',
      roles: ['developer'],
    });
  });
  afterAll(async () => {
    await t.close();
  });

  it('shows a new token once and lists it afterwards without its secret', async () => {
    const created = await makeToken('director', 'Listing', 'read');
    expect(created.secret).toMatch(/^gw_[\w-]{43}$/);
    expect(created.token).toMatchObject({ name: 'Listing', access: 'read', lastUsedAt: null });

    const listed: ApiToken[] = (await withCookie('director', 'GET', '/me/tokens')).json();
    const mine = listed.find((x) => x.id === created.token.id);
    expect(mine).toEqual(created.token);
    expect(JSON.stringify(listed)).not.toContain(created.secret);

    const stored = await t.db.query<{ token_hash: string }>(
      'SELECT token_hash FROM api_tokens WHERE id = $1',
      [created.token.id],
    );
    expect(stored.rows[0]!.token_hash).not.toContain(created.secret);
  });

  it('acts as its member, and notes when it was last used', async () => {
    const { token, secret } = await makeToken('developer', 'Acting', 'read');
    const me = await withToken(secret, 'GET', '/me');
    expect(me.json()).toMatchObject({ displayName: 'Devin Developer' });
    const projects = await withToken(secret, 'GET', '/projects');
    expect(projects.statusCode).toBe(200);
    expect(projects.json().map((p: { id: string }) => p.id)).toContain(projectId);

    const listed: ApiToken[] = (await withCookie('developer', 'GET', '/me/tokens')).json();
    expect(listed.find((x) => x.id === token.id)!.lastUsedAt).not.toBeNull();
  });

  it('keeps to its member’s permissions', async () => {
    const { secret } = await makeToken('developer', 'No backlog', 'write');
    const res = await withToken(secret, 'POST', `/projects/${projectId}/backlog`, {
      title: 'Not mine to add',
      category: 'must',
    });
    expect(res.statusCode).toBe(403);
  });

  it('can only read when it is read-only, on every route that changes something', async () => {
    const { secret } = await makeToken('director', 'Reader', 'read');
    const read = await withToken(secret, 'GET', `/projects/${projectId}/backlog`);
    expect(read.statusCode).toBe(200);

    // The MCP server is the exception: it offers a read-only token only the tools that read.
    const changing = routes.filter((r) => r.method !== 'GET' && !r.readOnlySafe);
    expect(routes.filter((r) => r.readOnlySafe).map((r) => r.url)).toEqual(['/api/mcp']);
    expect(changing.length).toBeGreaterThan(40);
    const zero = '00000000-0000-0000-0000-000000000000';
    for (const r of changing) {
      const url = r.url.replace(/:\w+/g, zero).replace(/^\/api/, '');
      const res = await withToken(secret, r.method, url, {});
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(403);
      expect(res.json().message).toBe('This API token can only read');
    }
  });

  it('records the token beside its member in history and in notifications', async () => {
    const { secret } = await makeToken('director', 'Claude on the laptop', 'write');
    const item = await withToken(secret, 'POST', `/projects/${projectId}/backlog`, {
      title: 'Made by an assistant',
      category: 'should',
    });
    expect(item.statusCode).toBe(201);
    const itemId = item.json().id;
    const developerId = (await withCookie('developer', 'GET', '/me')).json().id;
    const task = await withToken(secret, 'POST', `/projects/${projectId}/backlog/${itemId}/tasks`, {
      title: 'For Devin',
      category: 'code',
      assigneeId: developerId,
    });
    expect(task.statusCode).toBe(201);

    const history: ActivityEntry[] = (
      await withCookie(
        'director',
        'GET',
        `/projects/${projectId}/activity?entityType=backlog_item&entityId=${itemId}`,
      )
    ).json();
    expect(history.map((e) => [e.action, e.actor?.displayName, e.via])).toEqual([
      ['task.created', 'Dana Director', 'Claude on the laptop'],
      ['item.created', 'Dana Director', 'Claude on the laptop'],
    ]);

    // The same member in the app is just themselves.
    await withCookie('director', 'PATCH', `/projects/${projectId}/backlog/${itemId}`, {
      version: item.json().version,
      title: 'Renamed in the app',
    });
    const latest: ActivityEntry[] = (
      await withCookie(
        'director',
        'GET',
        `/projects/${projectId}/activity?entityType=backlog_item&entityId=${itemId}&limit=1`,
      )
    ).json();
    expect(latest[0]).toMatchObject({ action: 'item.updated', via: null });

    const bell: NotificationSummary = (
      await withCookie('developer', 'GET', '/notifications')
    ).json();
    const assigned = bell.notifications.find(
      (n) => n.kind === 'task.assigned' && n.task?.id === task.json().id,
    );
    expect(assigned).toMatchObject({
      actor: { displayName: 'Dana Director' },
      via: 'Claude on the laptop',
    });
  });

  it('cannot see, make, or revoke tokens', async () => {
    const { token, secret } = await makeToken('director', 'Self-serving', 'write');
    for (const [method, url, payload] of [
      ['GET', '/me/tokens'],
      ['POST', '/me/tokens', { name: 'Another', access: 'write' }],
      ['DELETE', `/me/tokens/${token.id}`],
    ] as const) {
      const res = await withToken(secret, method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    const listed: ApiToken[] = (await withCookie('director', 'GET', '/me/tokens')).json();
    expect(listed.map((x) => x.name)).toContain('Self-serving');
    expect(listed.map((x) => x.name)).not.toContain('Another');
  });

  it('refuses a token that does not work, whatever cookie comes with it', async () => {
    const { token, secret } = await makeToken('director', 'Soon revoked', 'read');
    const revoked = await withCookie('director', 'DELETE', `/me/tokens/${token.id}`);
    expect(revoked.statusCode).toBe(204);

    for (const authorization of [`Bearer ${secret}`, 'Bearer gw_nonsense', 'Bearer ', 'bearer']) {
      const res = await t.app.inject({
        method: 'GET',
        url: '/api/projects',
        headers: { authorization, cookie: cookies.director },
      });
      expect(res.statusCode, authorization).toBe(401);
    }
  });

  it('keeps names unique per member, and each member’s tokens their own', async () => {
    await makeToken('director', 'Twice', 'read');
    const again = await withCookie('director', 'POST', '/me/tokens', {
      name: ' Twice ',
      access: 'write',
    });
    expect(again.statusCode).toBe(409);
    // Another member may use the same name.
    const theirs = await makeToken('developer', 'Twice', 'read');

    const stranger = await withCookie('director', 'DELETE', `/me/tokens/${theirs.token.id}`);
    expect(stranger.statusCode).toBe(404);
    const listed: ApiToken[] = (await withCookie('director', 'GET', '/me/tokens')).json();
    expect(listed.map((x) => x.id)).not.toContain(theirs.token.id);

    const invalid = await withCookie('director', 'POST', '/me/tokens', {
      name: '',
      access: 'admin',
    });
    expect(invalid.statusCode).toBe(400);
  });

  it(`stops at ${MAX_TOKENS_PER_USER} tokens`, async () => {
    const cookie = await signInAs(t.app, 'tester');
    const make = (name: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/me/tokens',
        headers: { cookie },
        payload: { name, access: 'read' },
      });
    const existing: ApiToken[] = (
      await t.app.inject({ method: 'GET', url: '/api/me/tokens', headers: { cookie } })
    ).json();
    for (let i = existing.length; i < MAX_TOKENS_PER_USER; i++)
      expect((await make(`Token ${i}`)).statusCode).toBe(201);
    const over = await make('One too many');
    expect(over.statusCode).toBe(409);
    expect(over.json().message).toMatch(/Revoke one/);
  });

  it('needs a signed-in member to manage tokens', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me/tokens' });
    expect(res.statusCode).toBe(401);
  });
});
