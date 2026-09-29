import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { createPool } from '../src/db.ts';
import { nextDemoReset } from '../src/demoReset.ts';
import { migrate } from '../src/migrate.ts';
import { signInAs, signInAsTeamMember, startApp, type TestContext } from './helpers.ts';

const base = { DATABASE_URL: 'postgres://x:y@localhost:5432/z' };

describe('demo reset schedule', () => {
  it('falls on multiples of the interval counted from midnight UTC', () => {
    const at = (iso: string) => Date.parse(iso);
    expect(nextDemoReset(24, at('2026-09-29T13:45:00Z')).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
    expect(nextDemoReset(6, at('2026-09-29T13:45:00Z')).toISOString()).toBe(
      '2026-09-29T18:00:00.000Z',
    );
    // At the moment of a reset, the next one is a whole interval away.
    expect(nextDemoReset(6, at('2026-09-29T18:00:00Z')).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
  });

  it('needs the demo seed and mock sign-in, and is refused in production', () => {
    const demo = { ...base, SEED_DEMO: 'true', AUTH_MOCK: 'true' };
    expect(loadConfig({ ...demo, DEMO_RESET_HOURS: '24' }).demoResetHours).toBe(24);
    expect(loadConfig({ ...demo, DEMO_RESET_HOURS: '' }).demoResetHours).toBeNull();
    expect(() => loadConfig({ ...base, AUTH_MOCK: 'true', DEMO_RESET_HOURS: '24' })).toThrow(
      /SEED_DEMO/,
    );
    expect(() => loadConfig({ ...demo, DEMO_RESET_HOURS: '1.5' })).toThrow(/DEMO_RESET_HOURS/);
    expect(() => loadConfig({ ...base, APP_ENV: 'production', DEMO_RESET_HOURS: '24' })).toThrow(
      /DEMO_RESET_HOURS/,
    );
  });
});

describe('demo reset', () => {
  let t: TestContext;
  const attachments = 'test-results/demo-reset-attachments';
  beforeAll(async () => {
    // A database of its own: a reset drops everything, and the other test files share theirs.
    const shared = createPool(process.env.TEST_DATABASE_URL!);
    await shared.query('DROP DATABASE IF EXISTS gameweld_demo_reset WITH (FORCE)');
    await shared.query('CREATE DATABASE gameweld_demo_reset');
    await shared.end();
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = '/gameweld_demo_reset';
    await rm(attachments, { recursive: true, force: true });
    const own = createPool(url.href);
    await migrate(own);
    await own.end();
    t = await startApp({
      DATABASE_URL: url.href,
      SEED_DEMO: 'true',
      DEMO_RESET_HOURS: '24',
      ATTACHMENTS_DIR: attachments,
    });
  });
  afterAll(async () => {
    await t.close();
  });

  it('tells the sign-in page how often and when next', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(res.json().demoReset).toEqual({
      everyHours: 24,
      nextAt: nextDemoReset(24).toISOString(),
    });
  });

  it('turns away personas from outside the server while it runs, and no one else', async () => {
    const persona = await signInAs(t.app, 'developer');
    const team = await signInAsTeamMember(t, 'outside-lead@example.com');
    const reset = t.app.ctx.demoReset!;
    reset.resetting = true;
    try {
      const outside = (url: string, cookie?: string, method: 'GET' | 'POST' = 'GET') =>
        t.app.inject({
          method,
          url,
          remoteAddress: '203.0.113.9',
          ...(cookie ? { headers: { cookie } } : {}),
          ...(method === 'POST' ? { payload: { persona: 'tester' } } : {}),
        });
      const asPersona = await outside('/api/projects', persona);
      expect(asPersona.statusCode).toBe(503);
      expect(asPersona.json().message).toMatch(/sample data/);
      expect((await outside('/api/auth/mock/sign-in', undefined, 'POST')).statusCode).toBe(503);
      expect((await outside('/api/projects', team.cookie)).statusCode).toBe(200);
      expect((await outside('/api/auth/providers')).statusCode).toBe(200);
      // The scripts that make the sample data sign in from the server itself.
      expect(
        (await t.app.inject({ method: 'GET', url: '/api/projects', headers: { cookie: persona } }))
          .statusCode,
      ).toBe(200);
    } finally {
      reset.resetting = false;
    }
  });

  it('replaces the demo projects and the personas, and leaves the teams alone', async () => {
    const persona = await signInAs(t.app, 'director');
    const team = await signInAsTeamMember(t, 'team-lead@example.com');
    const create = async (cookie: string, name: string) => {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie },
        payload: { name },
      });
      expect(res.statusCode).toBe(201);
      return res.json().id as string;
    };
    const demoId = await create(persona, 'Made by a visitor');
    const teamId = await create(team.cookie, 'A team at work');
    for (const dir of [demoId, teamId]) {
      await mkdir(path.join(attachments, dir), { recursive: true });
      await writeFile(path.join(attachments, dir, 'file'), 'x');
    }

    const reset = t.app.ctx.demoReset!;
    // Stands in for the scripts, which need a listening server; the SQL is applied after them.
    Object.assign(reset, {
      populate: async (baseUrl: string) => {
        expect(baseUrl).toBe('http://127.0.0.1:1');
        expect(reset.resetting).toBe(true);
        return `UPDATE projects SET description = 'Populated' WHERE name = 'Demo project';`;
      },
    });
    await reset.run('http://127.0.0.1:1');
    expect(reset.resetting).toBe(false);

    const projects = await t.db.query<{ name: string; description: string; demo: boolean }>(
      'SELECT name, description, demo FROM projects ORDER BY name',
    );
    expect(projects.rows).toEqual([
      { name: 'A team at work', description: '', demo: false },
      { name: 'Demo project', description: 'Populated', demo: true },
    ]);
    expect(await readdir(attachments)).toEqual([teamId]);
    // The visitor's persona session went with the personas; the team's stays.
    const me = (cookie: string) =>
      t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect((await me(persona)).body).toBe('null');
    expect((await me(team.cookie)).json().email).toBe('team-lead@example.com');
  });
});
