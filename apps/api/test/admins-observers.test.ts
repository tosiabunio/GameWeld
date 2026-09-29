import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admit } from '../src/admission.ts';
import {
  ownDatabase,
  signInAs,
  signInAsTeamMember,
  startApp,
  type TestContext,
} from './helpers.ts';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

describe('Observers', () => {
  let t: TestContext;
  let lead: string;
  let observer: string;
  let projectId: string;
  let itemId: string;
  const run = Math.random().toString(36).slice(2, 8);
  const call = (method: Method, url: string, cookie: string, payload?: object) =>
    t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    t = await startApp();
    lead = (await signInAsTeamMember(t, `lead-${run}@example.com`)).cookie;
    observer = (await signInAsTeamMember(t, `watcher-${run}@example.com`)).cookie;
    projectId = (await call('POST', '/api/projects', lead, { name: `Watched ${run}` })).json().id;
    await call('POST', `/api/projects/${projectId}/boards`, lead, { name: 'Sprint' });
    itemId = (
      await call('POST', `/api/projects/${projectId}/backlog`, lead, {
        title: 'Grappling hook',
        category: 'must',
      })
    ).json().id;
    await call('POST', `/api/projects/${projectId}/members`, lead, {
      email: `pending-${run}@example.com`,
      roles: ['developer'],
    });
  });
  afterAll(async () => {
    await t.close();
  });

  it('holds that role alone, and never accepts items', async () => {
    const both = await call('POST', `/api/projects/${projectId}/members`, lead, {
      email: `watcher-${run}@example.com`,
      roles: ['observer', 'developer'],
    });
    expect(both.statusCode).toBe(400);
    expect(both.json().message).toMatch(/Observer holds no other role/);
    const added = await call('POST', `/api/projects/${projectId}/members`, lead, {
      email: `watcher-${run}@example.com`,
      roles: ['observer'],
      canAccept: true,
    });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ roles: ['observer'], canAccept: false });
  });

  it('reads the Backlog, the Workboard, and the Overview, and nothing else', async () => {
    const p = `/api/projects/${projectId}`;
    for (const url of [p, `${p}/backlog`, `${p}/backlog/${itemId}`, `${p}/board`, `${p}/overview`])
      expect((await call('GET', url, observer)).statusCode, url).toBe(200);
    expect((await call('GET', `${p}/activity`, observer)).statusCode).toBe(403);
    const detail = (await call('GET', p, observer)).json();
    expect(detail.roles).toEqual(['observer']);
    expect(detail.invitations).toEqual([]);
    expect(
      Object.entries(detail.permissions)
        .filter(([, v]) => v)
        .map(([k]) => k),
    ).toEqual(['project.view']);
  });

  it('changes nothing, not even a comment', async () => {
    const p = `/api/projects/${projectId}`;
    const tries: [Method, string, object][] = [
      ['POST', `${p}/backlog/${itemId}/comments`, { body: 'Nice' }],
      ['POST', `${p}/backlog/${itemId}/tasks`, { category: 'code', title: 'Rope' }],
      ['PATCH', `${p}/backlog/${itemId}`, { title: 'Hook' }],
    ];
    for (const [method, url, payload] of tries)
      expect((await call(method, url, observer, payload)).statusCode, url).toBe(403);
  });
});

describe('Admins', () => {
  let t: TestContext;
  let admin: { id: string; cookie: string };
  let lead: { id: string; cookie: string };
  let projectId: string;
  const call = (method: Method, url: string, cookie: string, payload?: object) =>
    t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    // A database of its own, so the admins in it are only this test's.
    t = await startApp({
      DATABASE_URL: await ownDatabase('gameweld_admins'),
      PROJECT_CREATORS: 'admins',
    });
    admin = await signInAsTeamMember(t, 'admin@example.com', { admin: true });
    lead = await signInAsTeamMember(t, 'lead@example.com');
    await t.db.query('UPDATE users SET can_create_projects = true WHERE id = $1', [lead.id]);
    projectId = (await call('POST', '/api/projects', lead.cookie, { name: 'Their own' })).json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('see every project and may do everything in it without being a member', async () => {
    const list = (await call('GET', '/api/projects', admin.cookie)).json();
    expect(list.map((p: { name: string }) => p.name)).toContain('Their own');
    const renamed = await call('PATCH', `/api/projects/${projectId}`, admin.cookie, {
      version: 1,
      name: 'Renamed by the admin',
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ name: 'Renamed by the admin', roles: [] });
    const history = await call('GET', `/api/projects/${projectId}/activity`, admin.cookie);
    expect(history.statusCode).toBe(200);
    // Someone who is neither a member nor an admin still does not see it.
    const stranger = await signInAsTeamMember(t, 'stranger@example.com');
    expect((await call('GET', `/api/projects/${projectId}`, stranger.cookie)).statusCode).toBe(404);
  });

  it('let someone create projects, at once or at their first sign-in', async () => {
    const member = await signInAsTeamMember(t, 'member@example.com');
    expect((await call('POST', '/api/projects', member.cookie, { name: 'x' })).statusCode).toBe(
      403,
    );
    const given = await call('POST', '/api/admin/invitations', admin.cookie, {
      email: 'Member@example.com',
      as: 'director',
    });
    expect(given.statusCode).toBe(201);
    expect(given.json()).toMatchObject({ canCreateProjects: true, isAdmin: false });
    expect((await call('POST', '/api/projects', member.cookie, { name: 'Mine' })).statusCode).toBe(
      201,
    );

    const invited = await call('POST', '/api/admin/invitations', admin.cookie, {
      email: 'newcomer@example.com',
      as: 'director',
    });
    expect(invited.statusCode).toBe(202);
    const admitted = await admit(
      t.db,
      'google',
      { subject: 'newcomer', email: 'newcomer@example.com', emailVerified: true, name: 'New' },
      null,
    );
    expect('userId' in admitted).toBe(true);
    const flags = await t.db.query(
      'SELECT can_create_projects, is_admin FROM users WHERE email = $1',
      ['newcomer@example.com'],
    );
    expect(flags.rows).toEqual([{ can_create_projects: true, is_admin: false }]);
    const people = (await call('GET', '/api/admin/people', admin.cookie)).json();
    expect(people.invitations).toEqual([]);
    expect(people.people.map((p: { email: string }) => p.email)).not.toContain(
      'director@gameweld.local',
    );
  });

  it('keep at least one admin, and give no rights to personas or through others', async () => {
    const self = await call('PATCH', `/api/admin/people/${admin.id}`, admin.cookie, {
      isAdmin: false,
    });
    expect(self.statusCode).toBe(409);
    const persona = await call('POST', '/api/admin/invitations', admin.cookie, {
      email: 'tester@gameweld.local',
      as: 'admin',
    });
    expect(persona.statusCode).toBe(400);
    expect((await call('GET', '/api/admin/people', lead.cookie)).statusCode).toBe(403);
    const asPersona = await signInAs(t.app, 'director');
    expect((await call('GET', '/api/admin/people', asPersona)).statusCode).toBe(403);

    const second = await call('POST', '/api/admin/invitations', admin.cookie, {
      email: 'lead@example.com',
      as: 'admin',
    });
    expect(second.json().isAdmin).toBe(true);
    const stepDown = await call('PATCH', `/api/admin/people/${admin.id}`, admin.cookie, {
      isAdmin: false,
    });
    expect(stepDown.statusCode).toBe(200);
  });
});
