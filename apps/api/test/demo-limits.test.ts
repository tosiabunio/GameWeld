import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rateLimit.ts';
import { multipart, signInAs, signInAsTeamMember, startApp, type TestContext } from './helpers.ts';

/**
 * The open demo shares an instance with teams, so what a visitor may ask of it has limits that a
 * team's members do not meet: requests a minute from one address, the room the demo's files take,
 * and the size of a board it imports.
 */
describe('a count of requests by address', () => {
  it('lets an address ask so much in a minute, and then says how long to wait', () => {
    let now = 1_000_000;
    const limiter = new RateLimiter(3, () => now);
    expect([1, 2, 3].map(() => limiter.take('a'))).toEqual([0, 0, 0]);
    expect(limiter.take('a')).toBe(60);
    // Another address has its own count.
    expect(limiter.take('b')).toBe(0);
    now += 45_000;
    expect(limiter.take('a')).toBe(15);
    now += 15_000;
    expect(limiter.take('a')).toBe(0);
  });

  it('counts a costly request as several, and lets the one through that reaches the limit', () => {
    const limiter = new RateLimiter(40, () => 0);
    expect(limiter.take('a', 20)).toBe(0);
    expect(limiter.take('a', 20)).toBe(0);
    expect(limiter.take('a')).toBe(60);
  });
});

describe('limits on the open demo', () => {
  let t: TestContext;
  let small: TestContext;
  const run = Math.random().toString(36).slice(2, 8);
  const outside = (n: number) => `203.0.113.${n}`;

  beforeAll(async () => {
    t = await startApp();
    // A second application on the same database, with limits small enough to meet in a test.
    small = await startApp({ RATE_LIMIT_PER_MINUTE: '40', DEMO_STORAGE_MB: '0.00001' });
  });
  afterAll(async () => {
    await small.close();
    await t.close();
  });

  const signIn = (remoteAddress: string) =>
    small.app.inject({
      method: 'POST',
      url: '/api/auth/mock/sign-in',
      payload: { persona: 'director' },
      remoteAddress,
    });

  it('turns away an address that asks too much, and nobody else', async () => {
    // A sign-in counts as twenty requests: two reach the forty an address has here.
    expect((await signIn(outside(1))).statusCode).toBe(204);
    const second = await signIn(outside(1));
    expect(second.statusCode).toBe(204);
    const cookie = `gw_session=${second.cookies.find((c) => c.name === 'gw_session')!.value}`;
    const third = await signIn(outside(1));
    expect(third.statusCode).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    expect(third.json().message).toMatch(/Too many requests/);
    // A persona from that address is turned away like someone not signed in.
    const asPersona = await small.app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { cookie },
      remoteAddress: outside(1),
    });
    expect(asPersona.statusCode).toBe(429);

    // Another address is not held to it, nor is the server itself, which fills the demo.
    expect((await signIn(outside(2))).statusCode).toBe(204);
    for (let i = 0; i < 5; i++) expect((await signIn('127.0.0.1')).statusCode).toBe(204);
    // The application itself is not an API call.
    const health = await small.app.inject({ method: 'GET', url: '/', remoteAddress: outside(1) });
    expect(health.statusCode).not.toBe(429);
  });

  it('does not limit a member of a team, whatever address they share', async () => {
    const member = await signInAsTeamMember(small, `busy-${run}@example.com`);
    await signIn(outside(3));
    await signIn(outside(3));
    expect((await signIn(outside(3))).statusCode).toBe(429);
    for (let i = 0; i < 50; i++) {
      const res = await small.app.inject({
        method: 'GET',
        url: '/api/projects',
        headers: { cookie: member.cookie },
        remoteAddress: outside(3),
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it('gives the demo’s files only so much room, and a team’s all they need', async () => {
    const director = await signInAs(t.app, 'director');
    const upload = async (app: TestContext, cookie: string) => {
      const post = (url: string, payload: object) =>
        app.app.inject({ method: 'POST', url, headers: { cookie }, payload });
      const project = (await post('/api/projects', { name: `Files ${run}` })).json();
      const item = (
        await post(`/api/projects/${project.id}/backlog`, {
          title: 'With a file',
          category: 'must',
        })
      ).json();
      const file = multipart('notes.txt', 'text/plain', 'More than ten bytes of notes.');
      return app.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/backlog/${item.id}/attachments`,
        headers: { cookie, ...file.headers },
        payload: file.body,
      });
    };
    // With room to spare the demo takes the file; that alone is more than the small limit.
    expect((await upload(t, director)).statusCode).toBe(201);
    const full = await upload(small, director);
    expect(full.statusCode, full.body).toBe(413);
    expect(full.json().message).toMatch(/no room/);
    // A team's project is not the demo's.
    const member = await signInAsTeamMember(small, `files-${run}@example.com`);
    expect((await upload(small, member.cookie)).statusCode).toBe(201);
  });

  it('imports a board of a size to try it with into the demo, and any size for a team', async () => {
    const board = {
      lists: [{ id: 'l', name: 'Everything' }],
      cards: Array.from({ length: 501 }, (_, i) => ({
        id: `c${i}`,
        idList: 'l',
        name: `Card ${i}`,
      })),
      checklists: [{ id: 'k', idCard: 'c7', checkItems: [{ name: 'A step', state: 'complete' }] }],
      actions: [
        { type: 'commentCard', date: '2026-01-02', data: { text: 'Second', card: { id: 'c7' } } },
        { type: 'commentCard', date: '2026-01-01', data: { text: 'First', card: { id: 'c7' } } },
        { type: 'updateCard', data: { card: { id: 'c7' } } },
      ],
    };
    const bring = async (cookie: string) => {
      const project = (
        await t.app.inject({
          method: 'POST',
          url: '/api/projects',
          headers: { cookie },
          payload: { name: `Import ${run}` },
        })
      ).json();
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/import/trello`,
        headers: { cookie },
        payload: { mode: 'cards_as_tasks', board },
      });
      return { res, projectId: project.id as string };
    };
    const demo = await bring(await signInAs(t.app, 'director'));
    expect(demo.res.statusCode).toBe(413);
    expect(demo.res.json().message).toMatch(/up to 500 cards/);

    const member = await signInAsTeamMember(t, `import-${run}@example.com`);
    const team = await bring(member.cookie);
    expect(team.res.statusCode, team.res.body).toBe(201);
    expect(team.res.json()).toMatchObject({ tasks: 501, checklistItems: 1, comments: 2 });
    // Each card gets its own comments, and only those.
    const comments = await t.db.query<{ body: string }>(
      `SELECT c.body FROM comments c JOIN tasks k ON k.id = c.task_id
        WHERE k.project_id = $1 AND k.title = 'Card 7'`,
      [team.projectId],
    );
    expect(comments.rows.map((r) => r.body.split('\n').pop()).sort()).toEqual(['First', 'Second']);
  });
});
