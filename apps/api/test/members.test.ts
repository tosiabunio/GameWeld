import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('membership management', () => {
  let t: TestContext;
  let director: string;
  let tester: string;
  let projectId: string;
  let testerId: string;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    tester = await signInAs(t.app, 'tester');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Members' },
    });
    projectId = created.json().id;
    testerId = (
      await t.db.query<{ id: string }>(`SELECT id FROM users WHERE email = 'tester@gameweld.local'`)
    ).rows[0]!.id;
  });
  afterAll(async () => {
    await t.close();
  });

  const url = (suffix = '') => `/api/projects/${projectId}/members${suffix}`;

  it('adds a member by email with several roles', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: url(),
      headers: { cookie: director },
      payload: {
        email: 'Tester@gameweld.local',
        roles: ['tester', 'developer', 'tester'],
        canAccept: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      userId: testerId,
      roles: ['tester', 'developer'],
      canAccept: true,
    });

    const dup = await t.app.inject({
      method: 'POST',
      url: url(),
      headers: { cookie: director },
      payload: { email: 'tester@gameweld.local', roles: ['tester'] },
    });
    expect(dup.statusCode).toBe(409);
    const unknown = await t.app.inject({
      method: 'POST',
      url: url(),
      headers: { cookie: director },
      payload: { email: 'nobody@gameweld.local', roles: ['tester'] },
    });
    expect(unknown.statusCode).toBe(404);
    const noRoles = await t.app.inject({
      method: 'POST',
      url: url(),
      headers: { cookie: director },
      payload: { email: 'developer@gameweld.local', roles: [] },
    });
    expect(noRoles.statusCode).toBe(400);
  });

  it('lets the new member see the project with its permissions', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: { cookie: tester },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().roles).toEqual(['tester', 'developer']);
    expect(res.json().permissions['item.accept']).toBe(true); // explicit acceptance permission (D5)
    expect(res.json().permissions['members.manage']).toBe(false);
  });

  it('updates roles and acceptance permission', async () => {
    const res = await t.app.inject({
      method: 'PATCH',
      url: url(`/${testerId}`),
      headers: { cookie: director },
      payload: { roles: ['tester'], canAccept: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ roles: ['tester'], canAccept: false });
    const activity = await t.db.query(
      `SELECT action FROM activity WHERE project_id = $1 ORDER BY id`,
      [projectId],
    );
    expect(activity.rows.map((r) => r.action)).toEqual([
      'project.created',
      'member.added',
      'member.updated',
    ]);
  });

  it('never leaves a project without a Game Director', async () => {
    const directorId = (
      await t.db.query<{ id: string }>(
        `SELECT id FROM users WHERE email = 'director@gameweld.local'`,
      )
    ).rows[0]!.id;
    const demote = await t.app.inject({
      method: 'PATCH',
      url: url(`/${directorId}`),
      headers: { cookie: director },
      payload: { roles: ['developer'] },
    });
    expect(demote.statusCode).toBe(409);
    const remove = await t.app.inject({
      method: 'DELETE',
      url: url(`/${directorId}`),
      headers: { cookie: director },
    });
    expect(remove.statusCode).toBe(409);

    // Promote the tester to Director, then the original Director may step down.
    await t.app.inject({
      method: 'PATCH',
      url: url(`/${testerId}`),
      headers: { cookie: director },
      payload: { roles: ['director', 'tester'] },
    });
    const stepDown = await t.app.inject({
      method: 'PATCH',
      url: url(`/${directorId}`),
      headers: { cookie: director },
      payload: { roles: ['developer'] },
    });
    expect(stepDown.statusCode).toBe(200);
    // ...and has now lost the right to manage members.
    const later = await t.app.inject({
      method: 'DELETE',
      url: url(`/${testerId}`),
      headers: { cookie: director },
    });
    expect(later.statusCode).toBe(403);
  });

  it('removes a member', async () => {
    const directorId = (
      await t.db.query<{ id: string }>(
        `SELECT id FROM users WHERE email = 'director@gameweld.local'`,
      )
    ).rows[0]!.id;
    const res = await t.app.inject({
      method: 'DELETE',
      url: url(`/${directorId}`),
      headers: { cookie: tester },
    });
    expect(res.statusCode).toBe(204);
    const gone = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: { cookie: director },
    });
    expect(gone.statusCode).toBe(404);
    const missing = await t.app.inject({
      method: 'DELETE',
      url: url(`/${directorId}`),
      headers: { cookie: tester },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('lists known users for the member picker', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie: tester },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((u: { email: string }) => u.email)).toContain('developer@gameweld.local');
  });
});
