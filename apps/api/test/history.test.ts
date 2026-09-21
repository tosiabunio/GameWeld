import type { ActivityEntry, BoardView, ColumnStay } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('history for analysis', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let projectId: string;
  let boardId: string;
  let taskId: string;
  let doingId: string;

  const get = (cookie: string, url: string) =>
    t.app.inject({ method: 'GET', url: `/api/projects/${projectId}${url}`, headers: { cookie } });
  const send = (cookie: string, method: 'POST' | 'PATCH', url: string, payload: object = {}) =>
    t.app.inject({
      method,
      url: `/api/projects/${projectId}${url}`,
      headers: { cookie },
      payload,
    });
  const history = async (query: string) =>
    (await get(director, `/activity?${query}`)).json() as ActivityEntry[];
  const stays = async (query: string) =>
    (await get(director, `/column-stays?${query}`)).json() as ColumnStay[];

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    projectId = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: director },
        payload: { name: 'History' },
      })
    ).json().id;
    await send(director, 'POST', '/members', {
      email: 'developer@gameweld.local',
      roles: ['developer'],
    });
    const itemId = (
      await send(director, 'POST', '/backlog', { title: 'Save game', category: 'must' })
    ).json().id;
    boardId = (await send(director, 'POST', '/boards', { name: 'Sprint 1' })).json().id;
    await send(director, 'POST', `/boards/${boardId}/scope`, { itemId });
    // A task of an item in scope goes straight to its To Do column.
    taskId = (
      await send(developer, 'POST', `/backlog/${itemId}/tasks`, {
        title: 'Write the save file',
        category: 'code',
      })
    ).json().id;
    const board: BoardView = (
      await send(director, 'POST', `/boards/${boardId}/columns`, { name: 'Doing' })
    ).json();
    doingId = board.columns.find((c) => c.name === 'Doing')!.id;
    await send(developer, 'POST', `/boards/${boardId}/placements/${taskId}/move`, {
      columnId: doingId,
    });
    // Completed from the task's window, not by dragging: the card still moves to Done.
    await send(developer, 'POST', `/tasks/${taskId}/complete`);

    // The same history, at times that make the arithmetic plain.
    await t.db.query(
      `UPDATE task_placements SET placed_at = '2026-09-01T09:00:00Z' WHERE task_id = $1`,
      [taskId],
    );
    const moves = await t.db.query<{ id: string }>(
      `SELECT id FROM activity WHERE entity_id = $1 AND action = 'task.moved' ORDER BY id`,
      [taskId],
    );
    expect(moves.rows).toHaveLength(2);
    await t.db.query(`UPDATE activity SET created_at = '2026-09-01T12:00:00Z' WHERE id = $1`, [
      moves.rows[0]!.id,
    ]);
    await t.db.query(
      `UPDATE activity SET created_at = '2026-09-02T12:00:00Z'
        WHERE entity_id = $1 AND (id = $2 OR action = 'task.completed')`,
      [taskId, moves.rows[1]!.id],
    );
  });
  afterAll(async () => {
    await t.close();
  });

  it('adds up the moves into stays per column, completion included', async () => {
    const list = await stays(`taskId=${taskId}`);
    expect(list.map((s) => [s.columnName, s.columnKind, s.enteredAt, s.leftAt])).toEqual([
      ['To Do · Code', 'todo_code', '2026-09-01T09:00:00.000Z', '2026-09-01T12:00:00.000Z'],
      ['Doing', 'intermediate', '2026-09-01T12:00:00.000Z', '2026-09-02T12:00:00.000Z'],
      ['Done', 'done', '2026-09-02T12:00:00.000Z', null],
    ]);
    expect(list.map((s) => s.hours).slice(0, 2)).toEqual([3, 24]);
    expect(list[0]).toMatchObject({
      taskTitle: 'Write the save file',
      category: 'code',
      itemTitle: 'Save game',
      boardId,
      boardName: 'Sprint 1',
    });
  });

  it('keeps to a window of time and a board', async () => {
    const window = await stays(`boardId=${boardId}&from=2026-09-01T13:00:00Z&to=2026-09-02`);
    expect(window.map((s) => s.columnName)).toEqual(['Doing']);
    const none = await stays(`boardId=00000000-0000-0000-0000-000000000000`);
    expect(none).toEqual([]);
  });

  it('filters the history by action, person, time, and page', async () => {
    const moves = await history(`actions=task.moved&entityType=task&entityId=${taskId}`);
    expect(moves.map((e) => e.action)).toEqual(['task.moved', 'task.moved']);
    expect(moves[0]).toMatchObject({
      entityTitle: 'Write the save file',
      actor: { displayName: 'Devin Developer' },
    });

    const family = await history('actions=task.*,scope.added');
    expect(new Set(family.map((e) => e.action.split('.')[0]))).toEqual(new Set(['task', 'scope']));

    const developerId = moves[0]!.actor!.id;
    const byDeveloper = await history(`actorId=${developerId}`);
    expect(byDeveloper.length).toBeGreaterThan(0);
    expect(byDeveloper.every((e) => e.actor?.id === developerId)).toBe(true);

    const onTheSecond = await history('from=2026-09-02&to=2026-09-03');
    expect(onTheSecond.map((e) => e.action).sort()).toEqual(['task.completed', 'task.moved']);

    const newest = await history('limit=2');
    const older = await history(`limit=2&before=${newest[1]!.id}`);
    expect(older[0]!.id).toBeLessThan(newest[1]!.id);

    const board = await history(`entityType=workboard&entityId=${boardId}&actions=board.created`);
    expect(board).toHaveLength(1);
    expect(board[0]!.entityTitle).toBe('Sprint 1');
  });

  it('refuses a query it cannot read', async () => {
    for (const query of ['actions=moved', 'from=yesterday', 'limit=0', 'actorId=someone']) {
      const res = await get(director, `/activity?${query}`);
      expect(res.statusCode, query).toBe(400);
    }
    expect((await get(director, '/column-stays?from=soon')).statusCode).toBe(400);
  });

  // Last, because it takes a move out of the history the other tests read.
  it('bridges a completion that moved a card before such moves were recorded', async () => {
    const recorded = await t.db.query(
      `DELETE FROM activity WHERE entity_id = $1 AND action = 'task.moved'
          AND created_at = '2026-09-02T12:00:00Z'`,
      [taskId],
    );
    expect(recorded.rowCount).toBe(1);
    const list = await stays(`taskId=${taskId}`);
    expect(list.map((s) => [s.columnName, s.hours])).toEqual([
      ['To Do · Code', 3],
      ['Doing', 24],
      ['Done', expect.any(Number)],
    ]);
  });
});
