import type { BoardView, TaskDetail, WorkRequest } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('task deletion and restoration', () => {
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
    const project = await post('/api/projects', { name: 'Task deletion regression' });
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

  it('deletes work from the board and item, protects stale edits, and restores it into To Do', async () => {
    const f = await fixture();
    await post(`${f.boardUrl}/scope`, { itemId: f.itemId });
    const completed = (
      await post(`${f.base}/backlog/${f.itemId}/tasks`, {
        title: 'Finished work',
        category: 'code',
      })
    ).json<TaskDetail>();
    await post(`${f.base}/tasks/${completed.id}/complete`);
    const task = (
      await post(`${f.base}/backlog/${f.itemId}/tasks`, {
        title: 'No longer needed',
        category: 'assets',
      })
    ).json<TaskDetail>();
    const patch = (version: number, archived: boolean, cookie = director) =>
      t.app.inject({
        method: 'PATCH',
        url: `${f.base}/tasks/${task.id}`,
        headers: { cookie },
        payload: { version, archived },
      });
    expect((await patch(task.version, true, developer)).statusCode).toBe(403);
    expect((await patch(task.version - 1, true)).statusCode).toBe(409);
    expect((await get(`${f.base}/tasks/${task.id}`)).json<TaskDetail>().placement).not.toBeNull();
    const deleted = await patch(task.version, true);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json<TaskDetail>()).toMatchObject({
      archived: true,
      completed: false,
      placement: null,
      item: { state: 'ready_for_review' },
    });
    const board = (await get(f.boardUrl)).json<BoardView>();
    expect(
      Object.values(board.cards)
        .flat()
        .map((c) => c.id),
    ).toEqual([completed.id]);
    expect(board.counts).toMatchObject({ placedTasks: 1, unfinishedTasks: 0 });
    expect(board.scope[0]?.taskCounts).toEqual({ total: 1, completed: 1 });
    expect((await post(`${f.boardUrl}/placements`, { taskId: task.id })).statusCode).toBe(409);
    const restored = await patch(deleted.json<TaskDetail>().version, false);
    expect(restored.statusCode).toBe(200);
    expect(restored.json<TaskDetail>()).toMatchObject({
      archived: false,
      completed: false,
      item: { state: 'open' },
      placement: { boardId: f.boardId, columnName: 'To Do · Assets' },
    });
  });

  it('deleting requested work resolves its pending request without completing it', async () => {
    const f = await fixture();
    const task = (
      await post(`${f.base}/backlog/${f.itemId}/tasks`, {
        title: 'Cancelled work',
        category: 'content',
      })
    ).json<TaskDetail>();
    const request = (
      await post(`${f.boardUrl}/requests`, { taskId: task.id }, developer)
    ).json<WorkRequest>();
    const deleted = await t.app.inject({
      method: 'PATCH',
      url: `${f.base}/tasks/${task.id}`,
      headers: { cookie: director },
      payload: { version: task.version, archived: true },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json<TaskDetail>()).toMatchObject({
      archived: true,
      completed: false,
      pendingRequest: null,
      item: { state: 'open' },
    });
    expect((await get(`${f.boardUrl}/requests`)).json<WorkRequest[]>()).toContainEqual(
      expect.objectContaining({ id: request.id, status: 'rejected', decisionNote: 'Task deleted' }),
    );
    expect((await get(f.boardUrl)).json<BoardView>().counts.pendingRequests).toBe(0);
    const restored = await t.app.inject({
      method: 'PATCH',
      url: `${f.base}/tasks/${task.id}`,
      headers: { cookie: director },
      payload: { version: deleted.json<TaskDetail>().version, archived: false },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json<TaskDetail>()).toMatchObject({ archived: false, placement: null });
    expect((await post(`${f.boardUrl}/requests`, { taskId: task.id }, developer)).statusCode).toBe(
      201,
    );
  });
});
