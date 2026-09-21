import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAdmin } from '../src/admin.ts';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('admin recovery commands', () => {
  let t: TestContext;
  let projectId: string;
  const lines: string[] = [];
  const admin = (...args: string[]) => {
    lines.length = 0;
    return runAdmin(t.db, args, (line) => lines.push(line));
  };

  beforeAll(async () => {
    t = await startApp();
    const director = await signInAs(t.app, 'director');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: `Recovery ${randomUUID().slice(0, 8)}` },
    });
    projectId = created.json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('grants and revokes admin by address', async () => {
    await admin('grant-admin', 'Tester@gameweld.local');
    await admin('list-admins');
    expect(lines.join('\n')).toContain('tester@gameweld.local');
    await admin('revoke-admin', 'tester@gameweld.local');
    await admin('list-admins');
    expect(lines.join('\n')).not.toContain('tester@gameweld.local');
    await expect(admin('grant-admin', 'nobody@example.com')).rejects.toThrow(/sign in once/);
  });

  it('makes an existing account a Game Director, keeping its other roles', async () => {
    const tester = await signInAs(t.app, 'tester');
    await admin('add-director', 'tester@gameweld.local', projectId);
    expect(lines[0]).toMatch(/now a Game Director/);
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: { cookie: tester },
    });
    expect(res.json().roles).toEqual(['director']);
    await admin('add-director', 'tester@gameweld.local', projectId);
    expect(lines[0]).toMatch(/already/);
  });

  it('invites someone who has not signed in as Game Director', async () => {
    const email = `lead-${randomUUID().slice(0, 8)}@example.com`;
    await admin('add-director', email, projectId);
    const inv = await t.db.query<{ roles: string[] }>(
      'SELECT roles::text[] AS roles FROM project_invitations WHERE project_id = $1 AND email = $2',
      [projectId, email],
    );
    expect(inv.rows[0]!.roles).toEqual(['director']);
  });

  it('explains itself when used wrongly', async () => {
    await expect(admin()).rejects.toThrow(/Commands:/);
    await expect(admin('add-director', 'x@example.com', 'demo')).rejects.toThrow(/project id/);
  });
});
