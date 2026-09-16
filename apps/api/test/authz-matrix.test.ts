import { can, PROJECT_ROLES, type ProjectAction, type ProjectRole } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, createContext } from '../src/app.ts';
import { createPool } from '../src/db.ts';
import { seedDemo } from '../src/seed.ts';
import { signInAs, testConfig, type TestContext } from './helpers.ts';

type InjectMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RouteInfo {
  method: InjectMethod;
  url: string;
  action: ProjectAction;
  /** Ownership rules (author, uploader, requester) may still answer 403 to an allowed role. */
  ownerScoped: boolean;
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
  let itemId: string;
  let linkId: string;
  let taskId: string;
  let boardId: string;
  let columnId: string;
  let requestId: string;
  let attachmentId: string;
  let commentId: string;
  let otherItemId: string;
  const cookies: Record<ProjectRole, string> = { director: '', developer: '', tester: '' };

  beforeAll(async () => {
    const config = testConfig();
    const db = createPool(config.databaseUrl);
    await seedDemo(db);
    // Collect routes as they are registered; the hook must exist before the routes do.
    const app = await buildApp(createContext(config, db), (instance) => {
      instance.addHook('onRoute', (r) => {
        const action = r.config?.projectAction;
        if (!action) return;
        for (const m of Array.isArray(r.method) ? r.method : [r.method]) {
          routes.push({
            method: m as InjectMethod,
            url: r.url,
            action,
            ownerScoped: r.config?.ownerScoped === true,
          });
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
    const item = await db.query<{ id: string }>(
      `INSERT INTO backlog_items (project_id, title, category, rank) VALUES ($1, 'Matrix item', 'must', 'a0') RETURNING id`,
      [projectId],
    );
    itemId = item.rows[0]!.id;
    const other = await db.query<{ id: string }>(
      `INSERT INTO backlog_items (project_id, title, category, rank) VALUES ($1, 'Other item', 'should', 'a0') RETURNING id`,
      [projectId],
    );
    otherItemId = other.rows[0]!.id;
    const task = await db.query<{ id: string }>(
      `INSERT INTO tasks (project_id, item_id, category, title) VALUES ($1, $2, 'code', 'Matrix task') RETURNING id`,
      [projectId, itemId],
    );
    taskId = task.rows[0]!.id;
    const board = await db.query<{ id: string }>(
      `INSERT INTO workboards (project_id, name) VALUES ($1, 'Matrix board') RETURNING id`,
      [projectId],
    );
    boardId = board.rows[0]!.id;
    const column = await db.query<{ id: string }>(
      `INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, 'Making', 'intermediate', 'm') RETURNING id`,
      [boardId],
    );
    columnId = column.rows[0]!.id;
    for (const [kind, rank] of [
      ['todo_code', 'a'],
      ['todo_assets', 'b'],
      ['todo_content', 'c'],
      ['done', 'z'],
    ] as const) {
      await db.query(
        `INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, $2, $3, $4)`,
        [boardId, kind, kind, rank],
      );
    }
    const extra = await db.query<{ id: string }>(
      `INSERT INTO users (display_name, email) VALUES ('Extra Member', 'extra@gameweld.local') RETURNING id`,
    );
    extraUserId = extra.rows[0]!.id;
  });
  afterAll(async () => {
    await t.close();
  });

  /** Recreates disposable fixtures that an allowed call may have consumed. */
  async function ensureFixtures() {
    await t.db.query(
      `INSERT INTO project_memberships (project_id, user_id, roles) VALUES ($1, $2, '{developer}') ON CONFLICT DO NOTHING`,
      [projectId, extraUserId],
    );
    const request = await t.db.query<{ id: string }>(
      `INSERT INTO work_requests (task_id, board_id, requester_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING id`,
      [taskId, boardId, extraUserId],
    );
    requestId =
      request.rows[0]?.id ??
      (
        await t.db.query<{ id: string }>(
          `SELECT id FROM work_requests WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [taskId],
        )
      ).rows[0]!.id;
    const attachment = await t.db.query<{ id: string }>(
      `INSERT INTO attachments (project_id, item_id, uploaded_by, file_name, content_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'fixture.txt', 'text/plain', 1, $4) RETURNING id`,
      [projectId, itemId, extraUserId, `${projectId}/${crypto.randomUUID()}`],
    );
    attachmentId = attachment.rows[0]!.id;
    const comment = await t.db.query<{ id: string }>(
      `INSERT INTO comments (project_id, item_id, author_id, body) VALUES ($1, $2, $3, 'fixture') RETURNING id`,
      [projectId, itemId, extraUserId],
    );
    commentId = comment.rows[0]!.id;
    await t.db.query(
      `INSERT INTO item_dependencies (item_id, depends_on_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [itemId, otherItemId],
    );
    const link = await t.db.query<{ id: string }>(
      `INSERT INTO links (project_id, item_id, url) VALUES ($1, $2, 'https://example.com') RETURNING id`,
      [projectId, itemId],
    );
    linkId = link.rows[0]!.id;
  }

  function concrete(url: string, pid = projectId) {
    return url
      .replace(':projectId', pid)
      .replace(':userId', extraUserId)
      .replace(':itemId', itemId)
      .replace(':linkId', linkId)
      .replace(':taskId', taskId)
      .replace(':boardId', boardId)
      .replace(':columnId', columnId)
      .replace(':requestId', requestId)
      .replace(':attachmentId', attachmentId)
      .replace(':commentId', commentId)
      .replace(':dependsOnItemId', otherItemId);
  }

  it('found project-scoped routes to check', () => {
    expect(routes.length).toBeGreaterThanOrEqual(5);
    expect(routes.map((r) => `${r.method} ${r.url}`)).toContain('PATCH /api/projects/:projectId');
  });

  it('answers 401 to anonymous callers on every route', async () => {
    await ensureFixtures();
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
    await ensureFixtures();
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
        await ensureFixtures();
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
          expect([401, ...(r.ownerScoped ? [] : [403])], label).not.toContain(res.statusCode);
        } else {
          expect(res.statusCode, label).toBe(403);
        }
      }
    });
  }
});
