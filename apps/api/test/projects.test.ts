import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('demo seed and project list', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('seeds once and then skips', async () => {
    const { seedDemo } = await import('../src/seed.ts');
    expect(await seedDemo(t.db)).toBe(false);
    const persona = await t.db.query(
      `SELECT count(*)::int AS n FROM identities WHERE provider = 'mock'`,
    );
    expect(persona.rows[0].n).toBe(3);
  });

  it('lists the demo project for every persona with its own roles', async () => {
    for (const [persona, role] of [
      ['director', 'director'],
      ['developer', 'developer'],
      ['tester', 'tester'],
    ] as const) {
      const cookie = await signInAs(t.app, persona);
      const res = await t.app.inject({ method: 'GET', url: '/api/projects', headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const project = res.json().find((p: { name: string }) => p.name === 'Demo project');
      expect(project).toMatchObject({
        roles: [role],
        scopeLimit: 3,
        doneRestricted: false,
        archived: false,
      });
      expect(project.itemCount).toBeGreaterThanOrEqual(4);
    }
  });

  it('seeds the Section 17 worked example on an active board', async () => {
    const board = await t.db.query(
      `SELECT name, state FROM workboards WHERE name = 'September production'`,
    );
    expect(board.rows[0]).toMatchObject({ state: 'active' });
    const placed = await t.db.query(
      `SELECT t.title, c.kind FROM task_placements p
         JOIN tasks t ON t.id = p.task_id JOIN board_columns c ON c.id = p.column_id
        WHERE p.is_current ORDER BY c.kind`,
    );
    expect(placed.rows.map((r) => r.kind)).toEqual(['todo_code', 'todo_assets', 'todo_content']);
  });
});

describe('project creation and settings', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
  });
  afterAll(async () => {
    await t.close();
  });

  it('makes the creator the first Game Director and records activity', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: developer },
      payload: {
        name: 'Side project',
        description: 'Created by a developer persona',
        scopeLimit: 2,
      },
    });
    expect(res.statusCode).toBe(201);
    const project = res.json();
    expect(project).toMatchObject({
      name: 'Side project',
      roles: ['director'],
      scopeLimit: 2,
      version: 1,
    });

    const detail = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
      headers: { cookie: developer },
    });
    expect(detail.json().members).toHaveLength(1);
    expect(detail.json().permissions['project.settings']).toBe(true);

    const activity = await t.db.query(`SELECT action FROM activity WHERE project_id = $1`, [
      project.id,
    ]);
    expect(activity.rows.map((r) => r.action)).toEqual(['project.created']);
  });

  it('rejects invalid input', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('updates settings with optimistic concurrency', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Settings' },
    });
    const { id, version } = created.json();

    const ok = await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${id}`,
      headers: { cookie: director },
      payload: { version, doneRestricted: true, scopeLimit: 7, name: 'Settings v2' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      name: 'Settings v2',
      doneRestricted: true,
      scopeLimit: 7,
      version: version + 1,
    });

    const stale = await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${id}`,
      headers: { cookie: director },
      payload: { version, name: 'Stale write' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().details.currentVersion).toBe(version + 1);

    const activity = await t.db.query(
      `SELECT previous, next FROM activity WHERE project_id = $1 AND action = 'project.updated'`,
      [id],
    );
    expect(activity.rows[0].previous.doneRestricted).toBe(false);
    expect(activity.rows[0].next.doneRestricted).toBe(true);
  });

  it('Section 15 "Done restriction is enabled": the permission half', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Restricted' },
    });
    const { id, version } = created.json();
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${id}/members`,
      headers: { cookie: director },
      payload: { email: 'developer@gameweld.local', roles: ['developer'] },
    });

    const before = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${id}`,
      headers: { cookie: developer },
    });
    expect(before.json().permissions['task.complete']).toBe(true);

    await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${id}`,
      headers: { cookie: director },
      payload: { version, doneRestricted: true },
    });

    const after = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${id}`,
      headers: { cookie: developer },
    });
    expect(after.json().permissions['task.complete']).toBe(false);
    // The Director does not silently bypass the restriction either (Section 4).
    const directorView = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${id}`,
      headers: { cookie: director },
    });
    expect(directorView.json().permissions['task.complete']).toBe(false);
  });

  it('archives and lists archived projects separately', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Old' },
    });
    const { id, version } = created.json();
    await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${id}`,
      headers: { cookie: director },
      payload: { version, archived: true },
    });

    const active = await t.app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { cookie: director },
    });
    expect(active.json().some((p: { id: string }) => p.id === id)).toBe(false);
    const archived = await t.app.inject({
      method: 'GET',
      url: '/api/projects?archived=true',
      headers: { cookie: director },
    });
    expect(archived.json().some((p: { id: string }) => p.id === id)).toBe(true);
  });
});
