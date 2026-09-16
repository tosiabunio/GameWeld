import type { BacklogItemDetail } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('completion and acceptance', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let tester: string;
  let projectId: string;
  let testerId: string;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    tester = await signInAs(t.app, 'tester');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Acceptance' },
    });
    projectId = created.json().id;
    for (const role of ['developer', 'tester'] as const) {
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: director },
        payload: { email: `${role}@gameweld.local`, roles: [role] },
      });
    }
    testerId = (
      await t.db.query<{ id: string }>(`SELECT id FROM users WHERE email = 'tester@gameweld.local'`)
    ).rows[0]!.id;
  });
  afterAll(async () => {
    await t.close();
  });

  const url = (itemId: string, suffix = '') =>
    `/api/projects/${projectId}/backlog/${itemId}${suffix}`;
  const detail = async (itemId: string): Promise<BacklogItemDetail> =>
    (
      await t.app.inject({ method: 'GET', url: url(itemId), headers: { cookie: developer } })
    ).json();
  async function readyItem(title: string): Promise<{ id: string; taskId: string }> {
    const item = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title, category: 'must' },
      })
    ).json();
    const task = (
      await t.app.inject({
        method: 'POST',
        url: url(item.id, '/tasks'),
        headers: { cookie: developer },
        payload: { category: 'code', title: 'Only task' },
      })
    ).json();
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${task.id}/complete`,
      headers: { cookie: developer },
    });
    expect((await detail(item.id)).state).toBe('ready_for_review');
    return { id: item.id, taskId: task.id };
  }
  const accept = (itemId: string, cookie = director, payload: object = {}) =>
    t.app.inject({ method: 'POST', url: url(itemId, '/accept'), headers: { cookie }, payload });

  it('Section 15 "Director accepts the item": Done with an acceptance record', async () => {
    const { id } = await readyItem('Accept me');
    const res = await accept(id, director, { note: 'Plays well.' });
    expect(res.statusCode).toBe(200);
    const d = await detail(id);
    expect(d.state).toBe('done');
    expect(d.acceptance).toMatchObject({
      acceptedBy: { displayName: 'Dana Director' },
      note: 'Plays well.',
      invalidatedAt: null,
    });
    expect(d.acceptanceHistory).toHaveLength(1);
    expect((await accept(id)).statusCode).toBe(409); // already accepted
    const activity = await t.db.query(
      `SELECT action FROM activity WHERE entity_id = $1 ORDER BY id`,
      [id],
    );
    expect(activity.rows.map((r) => r.action)).toContain('item.accepted');
  });

  it('only holders of the acceptance permission accept (D5)', async () => {
    const { id } = await readyItem('Guarded');
    expect((await accept(id, developer)).statusCode).toBe(403);
    expect((await accept(id, tester)).statusCode).toBe(403);
    await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/members/${testerId}`,
      headers: { cookie: director },
      payload: { canAccept: true },
    });
    expect((await accept(id, tester)).statusCode).toBe(200);
    expect((await detail(id)).acceptance?.acceptedBy.displayName).toBe('Tess Tester');
  });

  it('refuses to accept items that are not Ready for Review', async () => {
    const item = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title: 'Open item', category: 'should' },
      })
    ).json();
    expect((await accept(item.id)).statusCode).toBe(409);
  });

  it('invariant 6: rechecks task states at commit time', async () => {
    const { id, taskId } = await readyItem('Changed during review');
    // Simulate a change that raced past the cached state.
    await t.db.query(`UPDATE tasks SET completed = false, completed_at = NULL WHERE id = $1`, [
      taskId,
    ]);
    const res = await accept(id);
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/changed during review/);
    expect((await detail(id)).state).toBe('open');
  });

  it('Section 15 "An unfinished task is added to a Done item": reopens, acceptance kept in history', async () => {
    const { id } = await readyItem('Reopened after acceptance');
    await accept(id, director, { note: 'First pass' });
    const follow = await t.app.inject({
      method: 'POST',
      url: url(id, '/tasks'),
      headers: { cookie: developer },
      payload: { category: 'content', title: 'Timing adjustment' },
    });
    expect(follow.statusCode).toBe(201);
    let d = await detail(id);
    expect(d.state).toBe('open');
    expect(d.acceptance).toBeNull();
    expect(d.acceptanceHistory).toHaveLength(1);
    expect(d.acceptanceHistory[0]).toMatchObject({
      note: 'First pass',
      invalidatedReason: 'task created',
    });
    expect(d.acceptanceHistory[0]!.invalidatedAt).not.toBeNull();

    // Finish the follow-up, accept again: two records in history, one current.
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${follow.json().id}/complete`,
      headers: { cookie: developer },
    });
    expect((await accept(id, director, { note: 'Second pass' })).statusCode).toBe(200);
    d = await detail(id);
    expect(d.state).toBe('done');
    expect(d.acceptance?.note).toBe('Second pass');
    expect(d.acceptanceHistory.map((a) => a.note)).toEqual(['Second pass', 'First pass']);
  });

  it('reopening a task under a Done item also reopens it', async () => {
    const { id, taskId } = await readyItem('Reopen task');
    await accept(id);
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${taskId}/reopen`,
      headers: { cookie: developer },
    });
    expect(res.statusCode).toBe(200);
    const d = await detail(id);
    expect(d.state).toBe('open');
    expect(d.acceptanceHistory[0]?.invalidatedReason).toBe('task reopen');
  });

  it('rejection leaves the item Ready for Review with a visible comment; a task change then reopens it', async () => {
    const { id, taskId } = await readyItem('Rejected');
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: url(id, '/reject'),
          headers: { cookie: developer },
          payload: { note: 'no' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: url(id, '/reject'),
          headers: { cookie: director },
          payload: { note: '' },
        })
      ).statusCode,
    ).toBe(400);
    const rejected = await t.app.inject({
      method: 'POST',
      url: url(id, '/reject'),
      headers: { cookie: director },
      payload: { note: 'The timing feels off.' },
    });
    expect(rejected.statusCode).toBe(201);
    expect(rejected.json()).toMatchObject({
      kind: 'rejection',
      body: 'The timing feels off.',
      author: { displayName: 'Dana Director' },
    });
    let d = await detail(id);
    expect(d.state).toBe('ready_for_review'); // no extra rejection state
    expect(d.comments.map((c) => c.kind)).toEqual(['rejection']);

    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${taskId}/reopen`,
      headers: { cookie: developer },
    });
    d = await detail(id);
    expect(d.state).toBe('open');
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: url(id, '/reject'),
          headers: { cookie: director },
          payload: { note: 'again' },
        })
      ).statusCode,
    ).toBe(409);
  });

  it('members comment on items; comments never change state', async () => {
    const { id } = await readyItem('Commented');
    const res = await t.app.inject({
      method: 'POST',
      url: url(id, '/comments'),
      headers: { cookie: tester },
      payload: { body: 'Checked on the build from Tuesday.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: 'comment', author: { displayName: 'Tess Tester' } });
    const d = await detail(id);
    expect(d.state).toBe('ready_for_review');
    expect(d.comments).toHaveLength(1);
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: url(id, '/comments'),
          headers: { cookie: tester },
          payload: { body: '  ' },
        })
      ).statusCode,
    ).toBe(400);
  });
});
