import type { BoardView, WorkRequest } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('out-of-scope work requests (Section 9)', () => {
  let t: TestContext;
  let director: string;
  let director2: string;
  let developer: string;
  let tester: string;
  let projectId: string;
  let boardId: string;
  let flyingId: string;
  let swoopId: string;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    tester = await signInAs(t.app, 'tester');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Requests', scopeLimit: 1 },
    });
    projectId = created.json().id;
    for (const [role, roles] of [
      ['developer', ['developer']],
      ['tester', ['tester', 'director']],
    ] as const) {
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: director },
        payload: { email: `${role}@gameweld.local`, roles },
      });
    }
    director2 = tester; // the tester persona also holds the Director role here: a second Director
    const item = async (title: string) =>
      (
        await t.app.inject({
          method: 'POST',
          url: `/api/projects/${projectId}/backlog`,
          headers: { cookie: director },
          payload: { title, category: 'must' },
        })
      ).json().id;
    const ranged = await item('Ranged enemy');
    flyingId = await item('Flying enemy');
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/backlog/${ranged}/tasks`,
      headers: { cookie: developer },
      payload: { category: 'code', title: 'Targeting' },
    });
    swoopId = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog/${flyingId}/tasks`,
        headers: { cookie: developer },
        payload: { category: 'assets', title: 'Swoop animation' },
      })
    ).json().id;
    const board = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/boards`,
      headers: { cookie: director },
      payload: { name: 'September production' },
    });
    boardId = board.json().id;
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/boards/${boardId}/scope`,
      headers: { cookie: director },
      payload: { itemId: ranged },
    });
  });
  afterAll(async () => {
    await t.close();
  });

  const url = (suffix = '') => `/api/projects/${projectId}/boards/${boardId}/requests${suffix}`;
  const post = (u: string, payload: object | undefined, cookie: string) =>
    t.app.inject({ method: 'POST', url: u, headers: { cookie }, ...(payload ? { payload } : {}) });
  const board = async (): Promise<BoardView> =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/board`,
        headers: { cookie: developer },
      })
    ).json();
  const task = async (id: string) =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/tasks/${id}`,
        headers: { cookie: developer },
      })
    ).json();

  it('Section 15 "Developer requests work on an inactive item": the task stays unplaced until approval', async () => {
    const res = await post(
      url(),
      { taskId: swoopId, reason: 'An artist is free this week.' },
      developer,
    );
    expect(res.statusCode).toBe(201);
    const request: WorkRequest = res.json();
    expect(request).toMatchObject({
      status: 'pending',
      task: { title: 'Swoop animation', placed: false },
      item: { title: 'Flying enemy' },
      requester: { displayName: 'Devin Developer' },
    });
    expect((await task(swoopId)).placement).toBeNull();
    expect((await task(swoopId)).pendingRequest).toMatchObject({
      id: request.id,
      boardName: 'September production',
    });
    expect((await board()).counts.pendingRequests).toBe(1);
    // One pending request per task and board.
    expect((await post(url(), { taskId: swoopId }, tester)).statusCode).toBe(409);
    // A task whose item is in scope needs no request.
    const targeting = (
      await t.db.query<{ id: string }>(
        `SELECT id FROM tasks WHERE title = 'Targeting' AND project_id = $1`,
        [projectId],
      )
    ).rows[0]!.id;
    expect((await post(url(), { taskId: targeting }, developer)).statusCode).toBe(409);
  });

  it('lists requests for everyone, pending first; only the requester withdraws', async () => {
    const list: WorkRequest[] = (
      await t.app.inject({ method: 'GET', url: url(), headers: { cookie: tester } })
    ).json();
    expect(list.map((r) => r.status)).toEqual(['pending']);
    expect((await post(url(`/${list[0]!.id}/withdraw`), undefined, tester)).statusCode).toBe(403);
    const withdrawn = await post(url(`/${list[0]!.id}/withdraw`), undefined, developer);
    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json().status).toBe('withdrawn');
    expect((await post(url(`/${list[0]!.id}/withdraw`), undefined, developer)).statusCode).toBe(
      409,
    );
    expect((await task(swoopId)).pendingRequest).toBeNull();
  });

  it('Section 15 "Director approves that request": only that task enters, with the Out of scope badge', async () => {
    const request: WorkRequest = (
      await post(url(), { taskId: swoopId, reason: 'Still free.' }, developer)
    ).json();
    expect((await post(url(`/${request.id}/approve`), {}, developer)).statusCode).toBe(403);
    const approved = await post(url(`/${request.id}/approve`), { note: 'Go ahead.' }, director);
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      status: 'approved',
      decidedBy: { displayName: 'Dana Director' },
      decisionNote: 'Go ahead.',
      task: { placed: true },
    });
    const b = await board();
    const cards = Object.values(b.cards).flat();
    expect(cards.map((c) => c.title).sort()).toEqual(['Swoop animation', 'Targeting']);
    const swoop = cards.find((c) => c.title === 'Swoop animation')!;
    expect(swoop.outOfScope).toBe(true);
    expect(swoop.placement?.enteredAsException).toBe(true);
    expect(b.scope.map((s) => s.title)).toEqual(['Ranged enemy']); // Flying enemy itself did not enter scope
    expect(b.counts.pendingRequests).toBe(0);
    expect((await post(url(`/${request.id}/approve`), {}, director)).statusCode).toBe(409);
  });

  it('Section 15 "The parent later enters board scope": badge disappears, history stays', async () => {
    // Finish and accept Ranged enemy so it is no longer the priority pick, then make room.
    const ranged = (await board()).scope[0]!.id;
    const targeting = (
      await t.db.query<{ id: string }>(
        `SELECT id FROM tasks WHERE title = 'Targeting' AND project_id = $1`,
        [projectId],
      )
    ).rows[0]!.id;
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${targeting}/complete`,
      headers: { cookie: developer },
    });
    expect(
      (await post(`/api/projects/${projectId}/backlog/${ranged}/accept`, {}, director)).statusCode,
    ).toBe(200);
    await post(
      `/api/projects/${projectId}/boards/${boardId}/scope/${ranged}/remove`,
      { returnTasks: true },
      director,
    );
    const res = await post(
      `/api/projects/${projectId}/boards/${boardId}/scope`,
      { itemId: flyingId },
      director,
    );
    expect(res.statusCode).toBe(201);
    const b: BoardView = res.json();
    const swoop = Object.values(b.cards)
      .flat()
      .find((c) => c.title === 'Swoop animation')!;
    expect(swoop.outOfScope).toBe(false);
    expect(swoop.placement?.enteredAsException).toBe(true); // how it originally entered is preserved
    expect(
      Object.values(b.cards)
        .flat()
        .filter((c) => c.title === 'Swoop animation'),
    ).toHaveLength(1); // no duplicate
    const history = await t.db.query(
      `SELECT action FROM activity WHERE project_id = $1 AND action LIKE 'request.%' ORDER BY id`,
      [projectId],
    );
    expect(history.rows.map((r) => r.action)).toEqual([
      'request.created',
      'request.withdrawn',
      'request.created',
      'request.approved',
    ]);
  });

  it('rejects with a note, and rechecks before approving (invariant 9)', async () => {
    const extra = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title: 'Boss arena', category: 'should' },
      })
    ).json().id;
    const a = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog/${extra}/tasks`,
        headers: { cookie: developer },
        payload: { category: 'content', title: 'Dress the arena' },
      })
    ).json().id;
    const r1: WorkRequest = (await post(url(), { taskId: a }, developer)).json();
    const rejected = await post(url(`/${r1.id}/reject`), { note: 'Not this week.' }, director);
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({
      status: 'rejected',
      decisionNote: 'Not this week.',
      task: { placed: false },
    });

    // Request again, then complete the task behind the Director's back. Finishing the task
    // settles its request, so nothing is left to approve, and approving it anyway must refuse.
    const r2: WorkRequest = (await post(url(), { taskId: a }, developer)).json();
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${a}/complete`,
      headers: { cookie: developer },
    });
    const stale = await post(url(`/${r2.id}/approve`), {}, director);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().message).toMatch(/already rejected/);
    const list: WorkRequest[] = (
      await t.app.inject({ method: 'GET', url: url(), headers: { cookie: developer } })
    ).json();
    expect(list.find((r) => r.id === r2.id)).toMatchObject({
      status: 'rejected',
      decisionNote: 'Task completed',
    });
    expect((await task(a)).placement).toBeNull();
  });

  it('Section 15 "Two Directors approve conflicting placement requests": one placement, one conflict', async () => {
    const extra = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title: 'Contested', category: 'could' },
      })
    ).json().id;
    const taskId = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog/${extra}/tasks`,
        headers: { cookie: developer },
        payload: { category: 'code', title: 'Contested task' },
      })
    ).json().id;
    const request: WorkRequest = (await post(url(), { taskId }, developer)).json();
    const results = await Promise.all([
      post(url(`/${request.id}/approve`), { note: 'A' }, director),
      post(url(`/${request.id}/approve`), { note: 'B' }, director2),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const placements = await t.db.query(
      `SELECT count(*)::int AS n FROM task_placements WHERE task_id = $1 AND is_current`,
      [taskId],
    );
    expect(placements.rows[0].n).toBe(1);
    const loser = results.find((r) => r.statusCode === 409)!;
    expect(loser.json().message).toMatch(/already approved by/);
  });

  it('a direct Director placement is recorded as an approved exception', async () => {
    const extra = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title: 'Direct', category: 'could' },
      })
    ).json().id;
    const taskId = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog/${extra}/tasks`,
        headers: { cookie: developer },
        payload: { category: 'code', title: 'Direct task' },
      })
    ).json().id;
    const pending: WorkRequest = (await post(url(), { taskId }, developer)).json();
    const placed = await post(
      `/api/projects/${projectId}/boards/${boardId}/placements`,
      { taskId },
      director,
    );
    expect(placed.statusCode).toBe(201);
    const list: WorkRequest[] = (
      await t.app.inject({ method: 'GET', url: url(), headers: { cookie: developer } })
    ).json();
    const mine = list.filter((r) => r.task.id === taskId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      id: pending.id,
      status: 'approved',
      decisionNote: 'placed directly by a Game Director',
    });
    expect((await task(taskId)).pendingRequest).toBeNull();
  });
  it('creates the task with the request when the work is first written down on the Workboard', async () => {
    const item = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title: 'Photo mode', category: 'could' },
      })
    ).json().id;
    const newTask = { itemId: item, category: 'code', title: 'Free camera' };
    const res = await post(url(), { newTask, reason: 'A streamer asked for it.' }, developer);
    expect(res.statusCode).toBe(201);
    const request: WorkRequest = res.json();
    expect(request).toMatchObject({
      status: 'pending',
      task: { title: 'Free camera', category: 'code', placed: false },
      item: { title: 'Photo mode' },
      reason: 'A streamer asked for it.',
    });
    const created = await task(request.task.id);
    expect(created).toMatchObject({ placement: null, pendingRequest: { id: request.id } });

    // Approval places that task as any other request's.
    const approved = await post(url(`/${request.id}/approve`), { note: '' }, director);
    expect(approved.statusCode).toBe(200);
    expect((await task(request.task.id)).placement).toMatchObject({ enteredAsException: true });

    // One or the other, never both or neither; and nothing is created when the request cannot be.
    expect((await post(url(), { reason: 'nothing named' }, developer)).statusCode).toBe(400);
    expect((await post(url(), { taskId: request.task.id, newTask }, developer)).statusCode).toBe(
      400,
    );
    const inScope = (await board()).scope[0]!;
    const before = (
      await t.db.query('SELECT count(*) AS n FROM tasks WHERE project_id = $1', [projectId])
    ).rows[0];
    const refused = await post(
      url(),
      { newTask: { itemId: inScope.id, category: 'code', title: 'Should not exist' } },
      developer,
    );
    expect(refused.statusCode).toBe(409);
    const after = (
      await t.db.query('SELECT count(*) AS n FROM tasks WHERE project_id = $1', [projectId])
    ).rows[0];
    expect(after).toEqual(before);
  });
});
