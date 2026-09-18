import type { BacklogItemDetail, BoardView, TaskDetail, WorkRequest } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('board lifecycle regressions', () => {
  let t: TestContext;
  let director: string;
  let developer: string;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
  });
  afterAll(async () => t.close());

  const post = (url: string, payload: object = {}, cookie = director) =>
    t.app.inject({ method: 'POST', url, payload, headers: { cookie } });
  const get = (url: string) => t.app.inject({ method: 'GET', url, headers: { cookie: director } });

  async function fixture() {
    const project = await post('/api/projects', { name: 'Lifecycle regression' });
    expect(project.statusCode).toBe(201);
    const projectId = project.json<{ id: string }>().id;
    const base = `/api/projects/${projectId}`;
    expect(
      (await post(`${base}/members`, { email: 'developer@gameweld.local', roles: ['developer'] }))
        .statusCode,
    ).toBe(201);
    const item = await post(`${base}/backlog`, { title: 'Lifecycle item', category: 'must' });
    expect(item.statusCode).toBe(201);
    const itemId = item.json<{ id: string }>().id;
    const board = await post(`${base}/boards`, { name: 'First board' });
    expect(board.statusCode).toBe(201);
    const boardId = board.json<BoardView>().id;
    return { base, projectId, itemId, boardId, boardUrl: `${base}/boards/${boardId}` };
  }

  it('reopens an accepted task from an archived board into Breakdown, preserving history', async () => {
    const f = await fixture();
    expect((await post(`${f.boardUrl}/scope`, { itemId: f.itemId })).statusCode).toBe(201);
    const created = await post(`${f.base}/backlog/${f.itemId}/tasks`, {
      title: 'Completed work',
      category: 'code',
    });
    const taskId = created.json<TaskDetail>().id;
    expect((await post(`${f.base}/tasks/${taskId}/complete`)).statusCode).toBe(200);
    // Accepted after the archival: an archived board is history and keeps the completed card.
    // (Accepting on an active board takes the card off it; see acceptance-board.test.ts.)
    expect((await post(`${f.boardUrl}/archive`)).statusCode).toBe(200);
    expect((await post(`${f.base}/backlog/${f.itemId}/accept`)).statusCode).toBe(200);
    const next = (await post(`${f.base}/boards`, { name: 'Next board' })).json<BoardView>();

    const reopened = await post(`${f.base}/tasks/${taskId}/reopen`, {}, developer);
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json<TaskDetail>()).toMatchObject({ completed: false, placement: null });
    const item = (await get(`${f.base}/backlog/${f.itemId}`)).json<BacklogItemDetail>();
    expect(item.state).toBe('open');
    expect(item.acceptanceHistory[0]?.invalidatedAt).not.toBeNull();
    const history = await t.db.query(
      `SELECT p.is_current, p.removed_reason, c.kind FROM task_placements p
         JOIN board_columns c ON c.id = p.last_column_id WHERE p.task_id = $1`,
      [taskId],
    );
    expect(history.rows).toEqual([
      { is_current: false, removed_reason: 'reopened after board archival', kind: 'done' },
    ]);
    expect((await post(`${f.base}/boards/${next.id}/scope`, { itemId: f.itemId })).statusCode).toBe(
      201,
    );
    expect((await get(`${f.base}/tasks/${taskId}`)).json<TaskDetail>().placement?.boardId).toBe(
      next.id,
    );
  });

  it('resolves pending requests on archival so the requester can ask on the next board', async () => {
    const f = await fixture();
    const task = (
      await post(`${f.base}/backlog/${f.itemId}/tasks`, {
        title: 'Requested work',
        category: 'code',
      })
    ).json<TaskDetail>();
    const pending = (
      await post(`${f.boardUrl}/requests`, { taskId: task.id }, developer)
    ).json<WorkRequest>();
    const archived = await post(`${f.boardUrl}/archive`);
    expect(archived.statusCode).toBe(200);
    expect(archived.json<BoardView>().counts.pendingRequests).toBe(0);
    const requests = (await get(`${f.boardUrl}/requests`)).json<WorkRequest[]>();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      id: pending.id,
      status: 'rejected',
      decisionNote: 'Workboard archived',
      decidedBy: { displayName: 'Dana Director' },
    });
    expect(requests[0]?.decidedAt).not.toBeNull();
    const activity = await t.db.query(
      'SELECT action, next FROM activity WHERE entity_id = $1 ORDER BY id',
      [pending.id],
    );
    expect(activity.rows.at(-1)).toMatchObject({
      action: 'request.rejected',
      next: { note: 'Workboard archived' },
    });
    expect((await get(`${f.base}/tasks/${task.id}`)).json<TaskDetail>().pendingRequest).toBeNull();
    const next = (await post(`${f.base}/boards`, { name: 'Next board' })).json<BoardView>();
    expect(
      (await post(`${f.base}/boards/${next.id}/requests`, { taskId: task.id }, developer))
        .statusCode,
    ).toBe(201);
  });

  it('deletes an empty column while preserving returned placements and rejecting stale column IDs', async () => {
    const f = await fixture();
    await post(`${f.boardUrl}/scope`, { itemId: f.itemId });
    const task = (
      await post(`${f.base}/backlog/${f.itemId}/tasks`, {
        title: 'Returned work',
        category: 'code',
      })
    ).json<TaskDetail>();
    const board = (await post(`${f.boardUrl}/columns`, { name: 'Working' })).json<BoardView>();
    const column = board.columns.find((c) => c.kind === 'intermediate')!;
    expect(
      (await post(`${f.boardUrl}/placements/${task.id}/move`, { columnId: column.id })).statusCode,
    ).toBe(200);
    expect(
      (await post(`${f.boardUrl}/scope/${f.itemId}/remove`, { returnTasks: true })).statusCode,
    ).toBe(200);
    const removed = await t.app.inject({
      method: 'DELETE',
      url: `${f.boardUrl}/columns/${column.id}`,
      headers: { cookie: director },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json<BoardView>().columns.some((c) => c.id === column.id)).toBe(false);
    const history = await t.db.query(
      `SELECT c.name, p.column_id, p.last_column_id FROM task_placements p
         JOIN board_columns c ON c.id = p.column_id WHERE p.task_id = $1`,
      [task.id],
    );
    expect(history.rows).toEqual([
      { name: 'Working', column_id: column.id, last_column_id: column.id },
    ]);
    await post(`${f.boardUrl}/placements`, { taskId: task.id });
    expect(
      (await post(`${f.boardUrl}/placements/${task.id}/move`, { columnId: column.id })).statusCode,
    ).toBe(404);
    expect(
      (await post(`${f.boardUrl}/columns`, { name: 'Stale neighbor', afterColumnId: column.id }))
        .statusCode,
    ).toBe(409);
    for (const method of ['PATCH', 'DELETE'] as const) {
      const res = await t.app.inject({
        method,
        url: `${f.boardUrl}/columns/${column.id}`,
        headers: { cookie: director },
        ...(method === 'PATCH'
          ? { payload: { version: column.version, name: 'Stale rename' } }
          : {}),
      });
      expect(res.statusCode).toBe(404);
    }
  });

  for (const operation of ['archive', 'remove scope'] as const) {
    it(`keeps a new task unplaced when ${operation} wins the board lock`, async () => {
      const f = await fixture();
      await post(`${f.boardUrl}/scope`, { itemId: f.itemId });
      const blocker = await t.db.connect();
      let change: ReturnType<typeof post> | undefined;
      let creation: ReturnType<typeof post> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM workboards WHERE id = $1 FOR UPDATE', [f.boardId]);
        const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
          .rows[0]!.pid;
        change =
          operation === 'archive'
            ? post(`${f.boardUrl}/archive`)
            : post(`${f.boardUrl}/scope/${f.itemId}/remove`, { returnTasks: true });
        // Wait for the route's actual database lock, not a guessed sleep duration.
        await expect
          .poll(
            async () =>
              (
                await t.db.query(
                  'SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
                  [pid],
                )
              ).rowCount,
          )
          .toBe(1);
        creation = post(`${f.base}/backlog/${f.itemId}/tasks`, {
          title: 'Concurrent work',
          category: 'code',
        });
        await expect
          .poll(
            async () =>
              (
                await t.db.query(
                  `WITH RECURSIVE waiting AS (
             SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))
             UNION SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid = ANY(pg_blocking_pids(a.pid))
           ) SELECT count(*)::int AS n FROM waiting`,
                  [pid],
                )
              ).rows[0].n,
          )
          .toBe(2);
        await blocker.query('COMMIT');
        expect((await change).statusCode).toBe(200);
        const result = await creation;
        expect(result.statusCode).toBe(201);
        expect(result.json<TaskDetail>().placement).toBeNull();
        expect((await get(f.boardUrl)).json<BoardView>().counts.placedTasks).toBe(0);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await Promise.all([change, creation]);
      }
    });
  }
});
