import { can, PROJECT_ROLES, type ProjectAction, type ProjectRole } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { createPool } from '../src/db.ts';
import { seedDemo } from '../src/seed.ts';
import { signInAs, testConfig, type TestContext } from './helpers.ts';

type InjectMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RouteInfo {
  method: InjectMethod;
  url: string;
  action: ProjectAction;
}

/**
 * Implementation plan Section 4.3: every project-scoped route declares its action, and this test
 * calls each of them as each role to prove the matrix is enforced with no gaps. It also checks
 * that non-members get 404 and anonymous callers get 401.
 */
describe('permission matrix is enforced on every project-scoped route', () => {
  let t: TestContext;
  const routes: RouteInfo[] = [];
  let projectId: string;
  let extraUserId: string;
  const cookies: Record<ProjectRole, string> = { director: '', developer: '', tester: '' };

  beforeAll(async () => {
    const config = testConfig();
    const db = createPool(config.databaseUrl);
    await seedDemo(db);
    // Collect routes as they are registered; the hook must exist before the routes do.
    const app = await buildApp({ config, db }, (instance) => {
      instance.addHook('onRoute', (r) => {
        const action = r.config?.projectAction;
        if (!action) return;
        for (const m of Array.isArray(r.method) ? r.method : [r.method]) {
          routes.push({ method: m as InjectMethod, url: r.url, action });
        }
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

    for (const role of PROJECT_ROLES) cookies[role] = await signInAs(app, role);

    // A project where each persona holds exactly its own role, plus a disposable extra member.
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookies.director },
      payload: { name: 'Matrix project' },
    });
    projectId = created.json().id;
    for (const role of ['developer', 'tester'] as const) {
      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: cookies.director },
        payload: { email: `${role}@gameweld.local`, roles: [role] },
      });
    }
    const extra = await db.query<{ id: string }>(
      `INSERT INTO users (display_name, email) VALUES ('Extra Member', 'extra@gameweld.local') RETURNING id`,
    );
    extraUserId = extra.rows[0]!.id;
  });
  afterAll(async () => {
    await t.close();
  });

  async function ensureExtraMember() {
    await t.db.query(
      `INSERT INTO project_memberships (project_id, user_id, roles) VALUES ($1, $2, '{developer}') ON CONFLICT DO NOTHING`,
      [projectId, extraUserId],
    );
  }

  function concrete(url: string, pid = projectId) {
    return url.replace(':projectId', pid).replace(':userId', extraUserId);
  }

  it('found project-scoped routes to check', () => {
    expect(routes.length).toBeGreaterThanOrEqual(5);
    expect(routes.map((r) => `${r.method} ${r.url}`)).toContain('PATCH /api/projects/:projectId');
  });

  it('answers 401 to anonymous callers on every route', async () => {
    for (const r of routes) {
      const res = await t.app.inject({ method: r.method, url: concrete(r.url), payload: {} });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401);
    }
  });

  it('answers 404 to non-members on every route', async () => {
    const other = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookies.tester },
      payload: { name: 'Tester-only project' },
    });
    const otherId = other.json().id;
    for (const r of routes) {
      const res = await t.app.inject({
        method: r.method,
        url: concrete(r.url, otherId),
        headers: { cookie: cookies.developer },
        payload: {},
      });
      expect(res.statusCode, `${r.method} ${r.url} as non-member`).toBe(404);
    }
  });

  for (const role of PROJECT_ROLES) {
    it(`matches the matrix for a ${role}`, async () => {
      for (const r of routes) {
        await ensureExtraMember();
        const allowed = can({ roles: [role], canAccept: false }, r.action, {
          doneRestricted: false,
        });
        const res = await t.app.inject({
          method: r.method,
          url: concrete(r.url),
          headers: { cookie: cookies[role] },
          ...(r.method === 'GET' || r.method === 'DELETE' ? {} : { payload: {} }),
        });
        const label = `${r.method} ${r.url} as ${role} (action ${r.action})`;
        if (allowed) {
          expect([401, 403], label).not.toContain(res.statusCode);
        } else {
          expect(res.statusCode, label).toBe(403);
        }
      }
    });
  }
});
