import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, signInAsTeamMember, startApp, type TestContext } from './helpers.ts';

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

describe('team projects beside the demo', () => {
  let t: TestContext;
  let lead: { id: string; cookie: string };
  let member: { id: string; cookie: string };
  let persona: string;
  let teamId: string;
  let demoId: string;
  let teamUrl: string;
  const run = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    t = await startApp();
    lead = await signInAsTeamMember(t, `lead-${run}@example.com`);
    member = await signInAsTeamMember(t, `member-${run}@example.com`);
    persona = await signInAs(t.app, 'director');
    const create = (cookie: string, name: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie },
        payload: { name },
      });
    teamId = (await create(lead.cookie, `Team ${run}`)).json().id;
    demoId = (await create(persona, `Demo ${run}`)).json().id;
    teamUrl = `/api/projects/${teamId}/members`;
    await t.app.inject({
      method: 'POST',
      url: teamUrl,
      headers: { cookie: lead.cookie },
      payload: { email: `member-${run}@example.com`, roles: ['developer'] },
    });
  });
  afterAll(async () => {
    await t.close();
  });

  it('invites an address nobody has signed in with, once, and can cancel it', async () => {
    const invite = () =>
      t.app.inject({
        method: 'POST',
        url: teamUrl,
        headers: { cookie: lead.cookie },
        payload: { email: 'Nobody@Example.com', roles: ['tester'] },
      });
    const first = await invite();
    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({ email: 'nobody@example.com', roles: ['tester'] });
    expect((await invite()).statusCode).toBe(409);

    const detail = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${teamId}`,
      headers: { cookie: lead.cookie },
    });
    expect(detail.json().invitations.map((i: { email: string }) => i.email)).toEqual([
      'nobody@example.com',
    ]);

    const cancel = (cookie: string) =>
      t.app.inject({
        method: 'DELETE',
        url: `/api/projects/${teamId}/invitations/${first.json().id}`,
        headers: { cookie },
      });
    expect((await cancel(member.cookie)).statusCode).toBe(403);
    expect((await cancel(lead.cookie)).statusCode).toBe(204);
    expect((await cancel(lead.cookie)).statusCode).toBe(404);
  });

  it('keeps the personas out of team projects, and everyone else out of demo ones', async () => {
    const add = (projectId: string, cookie: string, email: string) =>
      t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie },
        payload: { email, roles: ['tester'] },
      });
    const intoTeam = await add(teamId, lead.cookie, 'tester@gameweld.local');
    expect(intoTeam.statusCode).toBe(400);
    expect(intoTeam.json().message).toMatch(/personas cannot join/);
    const intoDemo = await add(demoId, persona, `member-${run}@example.com`);
    expect(intoDemo.statusCode).toBe(400);
    expect((await add(demoId, persona, `stranger-${run}@example.com`)).statusCode).toBe(400);
    expect((await add(demoId, persona, 'tester@gameweld.local')).statusCode).toBe(201);
  });

  it('shows each only the people they share a project with', async () => {
    const emails = async (cookie: string) =>
      (await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie } }))
        .json()
        .map((u: { email: string }) => u.email);
    const seenByLead = await emails(lead.cookie);
    expect(seenByLead).toContain(`member-${run}@example.com`);
    expect(seenByLead).not.toContain('tester@gameweld.local');
    const seenByPersona = await emails(persona);
    expect(seenByPersona).toContain('tester@gameweld.local');
    expect(seenByPersona).not.toContain(`lead-${run}@example.com`);
  });
});
