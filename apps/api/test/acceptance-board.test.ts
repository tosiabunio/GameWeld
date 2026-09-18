import type { BacklogItemDetail, BoardView, TaskDetail } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

/** Section 8, scope-limit definition: an accepted item leaves the active Workboard with its tasks. */
describe('accepted items leave the Workboard', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let projectId: string;
  let boardId: string;
  const items: Record<string, string> = {};
  const tasks: Record<string, string> = {};

  const post = (url: string, payload?: object, cookie = director) =>
    t.app.inject({ method: 'POST', url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const get = async <T>(url: string): Promise<T> =>
    (await t.app.inject({ method: 'GET', url, headers: { cookie: developer } })).json();
  const project = () => `/api/projects/${projectId}`;
  const boards = () => `${project()}/boards`;
  const board = () => get<BoardView>(`${project()}/board`);
  const item = (title: string) => get<BacklogItemDetail>(`${project()}/backlog/${items[title]}`);
  const task = (title: string) => get<TaskDetail>(`${project()}/tasks/${tasks[title]}`);
  const doneTitles = (b: BoardView) =>
    b.cards[b.columns.find((c) => c.kind === 'done')!.id]!.map((c) => c.title).sort();
  const finish = async (b: BoardView, title: string) => {
    const columnId = b.columns.find((c) => c.kind === 'done')!.id;
    const res = await post(
      `${boards()}/${boardId}/placements/${tasks[title]}/move`,
      { columnId },
      developer,
    );
    expect(res.statusCode).toBe(200);
  };

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    projectId = (await post('/api/projects', { name: 'Accepted leave', scopeLimit: 1 })).json().id;
    await post(`${project()}/members`, { email: 'developer@gameweld.local', roles: ['developer'] });
    for (const title of ['Ranged enemy', 'Flying enemy', 'Boss arena'])
      items[title] = (await post(`${project()}/backlog`, { title, category: 'must' })).json().id;
    for (const [parent, category, title] of [
      ['Ranged enemy', 'code', 'Targeting'],
      ['Ranged enemy', 'assets', 'Attack animation'],
      ['Flying enemy', 'assets', 'Swoop animation'],
      ['Boss arena', 'content', 'Dress the arena'],
    ] as const)
      tasks[title] = (
        await post(`${project()}/backlog/${items[parent]}/tasks`, { category, title }, developer)
      ).json().id;
    boardId = (await post(boards(), { name: 'September' })).json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('removes the item from scope and every one of its tasks from the board', async () => {
    // Ranged enemy is in scope; Flying enemy's task is there as an out-of-scope exception.
    expect(
      (await post(`${boards()}/${boardId}/scope`, { itemId: items['Ranged enemy'] })).statusCode,
    ).toBe(201);
    expect(
      (await post(`${boards()}/${boardId}/placements`, { taskId: tasks['Swoop animation'] }))
        .statusCode,
    ).toBe(201);
    let b = await board();
    for (const title of ['Targeting', 'Attack animation', 'Swoop animation'])
      await finish(b, title);
    b = await board();
    expect(b.scope.map((s) => s.title)).toEqual(['Ranged enemy']);
    expect(doneTitles(b)).toEqual(['Attack animation', 'Swoop animation', 'Targeting']);
    expect((await item('Ranged enemy')).state).toBe('ready_for_review');

    expect(
      (await post(`${project()}/backlog/${items['Ranged enemy']}/accept`, { note: 'Good.' }))
        .statusCode,
    ).toBe(200);

    b = await board();
    expect(b.scope).toEqual([]);
    expect(b.counts).toMatchObject({ scopeItems: 0, acceptedItems: 0 });
    expect(doneTitles(b)).toEqual(['Swoop animation']);
    const accepted = await item('Ranged enemy');
    expect(accepted).toMatchObject({ state: 'done', activeBoard: null });
    // The tasks are still complete (R1) and simply no longer placed; history keeps the column (R5).
    for (const title of ['Targeting', 'Attack animation'])
      expect(await task(title)).toMatchObject({ completed: true, placement: null });
    const closed = await t.db.query<{ removed_reason: string; last_column_id: string | null }>(
      'SELECT removed_reason, last_column_id FROM task_placements WHERE task_id = $1',
      [tasks['Targeting']],
    );
    expect(closed.rows).toEqual([
      {
        removed_reason: 'item accepted',
        last_column_id: b.columns.find((c) => c.kind === 'done')!.id,
      },
    ]);
    const activity = await t.db.query<{ next: Record<string, unknown> }>(
      `SELECT next FROM activity WHERE entity_id = $1 AND action = 'scope.removed'`,
      [items['Ranged enemy']],
    );
    expect(activity.rows.map((r) => r.next)).toEqual([
      { boardId, reason: 'item accepted', wasInScope: true, removedTasks: 2 },
    ]);
  });

  it('frees the place in scope for the next item', async () => {
    // The limit is 1, and the accepted item no longer counts against it.
    const res = await post(`${boards()}/${boardId}/scope`, { itemId: items['Boss arena'] });
    expect(res.statusCode).toBe(201);
    expect((res.json() as BoardView).counts.scopeItems).toBe(1);
  });

  it('takes out-of-scope tasks of an accepted item off the board too', async () => {
    expect((await item('Flying enemy')).state).toBe('ready_for_review');
    expect((await post(`${project()}/backlog/${items['Flying enemy']}/accept`)).statusCode).toBe(
      200,
    );
    const b = await board();
    expect(doneTitles(b)).toEqual([]);
    expect(b.scope.map((s) => s.title)).toEqual(['Boss arena']);
    expect(await task('Swoop animation')).toMatchObject({ completed: true, placement: null });
  });

  it('a task reopened under the accepted item returns to Breakdown, not to the board', async () => {
    const res = await post(`${project()}/tasks/${tasks['Targeting']}/reopen`, undefined, developer);
    expect(res.statusCode).toBe(200);
    expect(await task('Targeting')).toMatchObject({ completed: false, placement: null });
    expect(await item('Ranged enemy')).toMatchObject({ state: 'open', activeBoard: null });
    const b = await board();
    expect(
      Object.values(b.cards)
        .flat()
        .map((c) => c.title),
    ).toEqual(['Dress the arena']);
  });

  it('leaves archived Workboards as they were', async () => {
    const b = await board();
    await finish(b, 'Dress the arena');
    expect((await item('Boss arena')).state).toBe('ready_for_review');
    expect(
      (await post(`${boards()}/${boardId}/archive`, { returnUnfinished: true })).statusCode,
    ).toBe(200);
    expect((await post(`${project()}/backlog/${items['Boss arena']}/accept`)).statusCode).toBe(200);
    const archived = await get<BoardView>(`${boards()}/${boardId}`);
    expect(archived.state).toBe('archived');
    expect(archived.scope.map((s) => [s.title, s.accepted])).toEqual([['Boss arena', true]]);
    expect(doneTitles(archived)).toEqual(['Dress the arena']);
  });
});
