import type { BoardView, TaskDetail, WorkRequest } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

/**
 * Nothing is left stranded: an unfinished task of an item in the active Workboard's scope is on
 * that board however it came to be there, a request never waits for a task that no longer needs
 * it, and nothing keeps pointing at an item or a member that is gone.
 */
describe('nothing is stranded', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let developerId: string;
  let projectId: string;
  let boardId: string;

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    t.app.inject({
      method,
      url: `/api/projects/${projectId}${url}`,
      headers: { cookie: director },
      ...(payload ? { payload } : {}),
    });
  const createItem = async (title: string) =>
    (await call('POST', '/backlog', { title, category: 'must' })).json().id as string;
  const createTask = async (itemId: string, title: string, extra: object = {}) =>
    (await call('POST', `/backlog/${itemId}/tasks`, { title, category: 'code', ...extra })).json()
      .id as string;
  const task = async (id: string): Promise<TaskDetail> =>
    (await call('GET', `/tasks/${id}`)).json();
  const patchTask = async (id: string, payload: object) =>
    call('PATCH', `/tasks/${id}`, { version: (await task(id)).version, ...payload });
  const board = async (): Promise<BoardView> => (await call('GET', '/board')).json();
  const requests = async (): Promise<WorkRequest[]> =>
    (await call('GET', `/boards/${boardId}/requests`)).json();
  /** Puts an item in scope without the route, which these scenarios are not about. */
  const intoScope = (itemId: string) =>
    t.db.query('INSERT INTO workboard_scope (board_id, item_id) VALUES ($1, $2)', [
      boardId,
      itemId,
    ]);

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Stranded', scopeLimit: 10 },
    });
    projectId = created.json().id;
    await call('POST', '/members', { email: 'developer@gameweld.local', roles: ['developer'] });
    developerId = (
      await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: developer } })
    ).json().id;
    boardId = (await call('POST', '/boards', { name: 'Sprint' })).json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('a task added in the Breakdown to an item in scope is on the board at once', async () => {
    const item = await createItem('Created');
    await intoScope(item);
    const id = await createTask(item, 'New in Breakdown');
    expect((await task(id)).placement).toMatchObject({ boardId, columnName: 'To Do · Code' });
  });

  it('a finished task reopened under an item in scope goes onto the board', async () => {
    const item = await createItem('Reopened');
    const id = await createTask(item, 'Done early');
    await call('POST', `/tasks/${id}/complete`);
    await createTask(item, 'Still open');
    await intoScope(item);
    expect((await task(id)).placement).toBeNull();
    await call('POST', `/tasks/${id}/reopen`);
    expect((await task(id)).placement).toMatchObject({ boardId, inDone: false });
  });

  it('a task moved under an item in scope goes onto the board, and its request is settled', async () => {
    const outside = await createItem('Outside');
    const inside = await createItem('Inside');
    await intoScope(inside);
    const id = await createTask(outside, 'Moves in');
    const asked = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/boards/${boardId}/requests`,
      headers: { cookie: developer },
      payload: { taskId: id },
    });
    expect(asked.statusCode).toBe(201);
    expect((await patchTask(id, { itemId: inside })).statusCode).toBe(200);
    expect((await task(id)).placement).toMatchObject({ boardId, enteredAsException: false });
    expect((await task(id)).pendingRequest).toBeNull();
    expect((await requests()).find((r) => r.task.id === id)).toMatchObject({ status: 'approved' });
  });

  it('an item entering the scope settles the requests its tasks were waiting on', async () => {
    const item = await createItem('Enters scope');
    const id = await createTask(item, 'Asked for');
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/boards/${boardId}/requests`,
      headers: { cookie: developer },
      payload: { taskId: id },
    });
    // Through the real route, with room in the scope.
    await t.db.query(`DELETE FROM workboard_scope WHERE board_id = $1`, [boardId]);
    const added = await call('POST', `/boards/${boardId}/scope`, { itemId: item });
    expect(added.statusCode, added.body).toBe(201);
    expect((await task(id)).placement).toMatchObject({ boardId });
    expect((await task(id)).pendingRequest).toBeNull();
    expect((await board()).counts.pendingRequests).toBe(0);
  });

  it('finishing a task settles the request that asked for it', async () => {
    const item = await createItem('Finished while waiting');
    const id = await createTask(item, 'Done before approval');
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/boards/${boardId}/requests`,
      headers: { cookie: developer },
      payload: { taskId: id },
    });
    await call('POST', `/tasks/${id}/complete`);
    expect((await task(id)).pendingRequest).toBeNull();
    expect((await requests()).find((r) => r.task.id === id)).toMatchObject({
      status: 'rejected',
      decisionNote: 'Task completed',
    });
  });

  it('an archived item leaves the scope, and its finished cards leave the board with it', async () => {
    const item = await createItem('Archived');
    await intoScope(item);
    const id = await createTask(item, 'Finished card');
    await call('POST', `/tasks/${id}/complete`);
    expect((await task(id)).placement).toMatchObject({ inDone: true });
    const current = (await call('GET', `/backlog/${item}`)).json();
    const archived = await call('PATCH', `/backlog/${item}`, {
      version: current.version,
      archived: true,
    });
    expect(archived.statusCode, archived.body).toBe(200);
    expect((await board()).scope.some((s) => s.id === item)).toBe(false);
    expect((await task(id)).placement).toBeNull();
    expect((await task(id)).completed).toBe(true);
  });

  it('a removed member’s unfinished tasks are handed back, finished ones keep their name', async () => {
    const item = await createItem('Member leaves');
    const open = await createTask(item, 'Theirs, open', { assigneeId: developerId });
    const done = await createTask(item, 'Theirs, done', { assigneeId: developerId });
    await call('POST', `/tasks/${done}/complete`);
    const removed = await call('DELETE', `/members/${developerId}`);
    expect(removed.statusCode, removed.body).toBe(204);
    expect((await task(open)).assignee).toBeNull();
    expect((await task(done)).assignee).toMatchObject({ id: developerId });
  });
});
