import type { BoardView, ChecklistItem, TaskDetail } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('task checklists', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let projectId: string;
  let taskId: string;

  const call = (
    cookie: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    t.app.inject({
      method,
      url: `/api/projects/${projectId}${url}`,
      headers: { cookie },
      ...(payload ? { payload } : {}),
    });
  const list = `/checklist`;
  const task = async (): Promise<TaskDetail> =>
    (await call(developer, 'GET', `/tasks/${taskId}`)).json();

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    projectId = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: director },
        payload: { name: 'Checklists' },
      })
    ).json().id;
    await call(director, 'POST', '/members', {
      email: 'developer@gameweld.local',
      roles: ['developer'],
    });
    const item = (
      await call(director, 'POST', '/backlog', { title: 'Boss', category: 'must' })
    ).json().id;
    const board = (await call(director, 'POST', '/boards', { name: 'Sprint' })).json().id;
    await call(director, 'POST', `/boards/${board}/scope`, { itemId: item });
    taskId = (
      await call(developer, 'POST', `/backlog/${item}/tasks`, {
        title: 'Phase two',
        category: 'code',
      })
    ).json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('keeps items in the order they were added, and counts progress wherever the task is listed', async () => {
    expect((await task()).checklist).toEqual({ total: 0, done: 0 });
    for (const title of ['Telegraph the attack', '  Spawn adds  ', 'Tune damage']) {
      const res = await call(developer, 'POST', `/tasks/${taskId}${list}`, { title });
      expect(res.statusCode).toBe(201);
    }
    const items = (await task()).checklistItems;
    expect(items.map((i) => i.title)).toEqual([
      'Telegraph the attack',
      'Spawn adds',
      'Tune damage',
    ]);
    expect(items.every((i) => !i.done)).toBe(true);

    const ticked: ChecklistItem[] = (
      await call(developer, 'PATCH', `/tasks/${taskId}${list}/${items[1]!.id}`, { done: true })
    ).json();
    expect(ticked.map((i) => i.done)).toEqual([false, true, false]);
    expect((await task()).checklist).toEqual({ total: 3, done: 1 });
    // The Workboard's cards carry the same count.
    const board: BoardView = (await call(developer, 'GET', '/board')).json();
    const card = Object.values(board.cards)
      .flat()
      .find((c) => c.id === taskId)!;
    expect(card.checklist).toEqual({ total: 3, done: 1 });
    // Ticking decides nothing about the task itself.
    expect((await task()).completed).toBe(false);
  });

  it('renames, unticks, and removes items', async () => {
    const [first, second] = (await task()).checklistItems;
    await call(developer, 'PATCH', `/tasks/${taskId}${list}/${first!.id}`, {
      title: 'Telegraph it',
    });
    await call(developer, 'PATCH', `/tasks/${taskId}${list}/${second!.id}`, { done: false });
    const removed: ChecklistItem[] = (
      await call(developer, 'DELETE', `/tasks/${taskId}${list}/${second!.id}`)
    ).json();
    expect(removed.map((i) => i.title)).toEqual(['Telegraph it', 'Tune damage']);
    expect((await task()).checklist).toEqual({ total: 2, done: 0 });
  });

  it('refuses what makes no sense', async () => {
    const [first] = (await task()).checklistItems;
    expect(
      (await call(developer, 'POST', `/tasks/${taskId}${list}`, { title: '   ' })).statusCode,
    ).toBe(400);
    expect(
      (await call(developer, 'PATCH', `/tasks/${taskId}${list}/${first!.id}`, {})).statusCode,
    ).toBe(400);
    expect(
      (await call(developer, 'PATCH', `/tasks/${taskId}${list}/nope`, { done: true })).statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          developer,
          'DELETE',
          `/tasks/${taskId}${list}/00000000-0000-4000-8000-000000000000`,
        )
      ).statusCode,
    ).toBe(404);

    // A deleted task's checklist is kept as it was, and comes back with the task.
    const current = await task();
    await call(director, 'PATCH', `/tasks/${taskId}`, { version: current.version, archived: true });
    expect(
      (await call(developer, 'POST', `/tasks/${taskId}${list}`, { title: 'Late' })).statusCode,
    ).toBe(409);
    expect((await task()).checklistItems).toHaveLength(2);
  });
});
