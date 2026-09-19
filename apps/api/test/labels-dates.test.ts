import type {
  BoardView,
  Label,
  NotificationSummary,
  ProjectDetail,
  TaskDetail,
} from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('labels, the blocked flag, and dates', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let projectId: string;
  let boardId: string;
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
  const task = async (): Promise<TaskDetail> =>
    (await call(developer, 'GET', `/tasks/${taskId}`)).json();
  const patch = async (cookie: string, payload: object) =>
    call(cookie, 'PATCH', `/tasks/${taskId}`, { version: (await task()).version, ...payload });

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    projectId = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: director },
        payload: { name: 'Labelled' },
      })
    ).json().id;
    await call(director, 'POST', '/members', {
      email: 'developer@gameweld.local',
      roles: ['developer'],
    });
    const item = (
      await call(director, 'POST', '/backlog', { title: 'Boss', category: 'must' })
    ).json().id;
    boardId = (await call(director, 'POST', '/boards', { name: 'Sprint' })).json().id;
    await call(director, 'POST', `/boards/${boardId}/scope`, { itemId: item });
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

  let bug: Label;
  let polish: Label;

  it('lets anyone who works on tasks add a label; renaming and deleting are a Director’s', async () => {
    const created = await call(developer, 'POST', '/labels', { name: ' Bug ', color: 'red' });
    expect(created.statusCode).toBe(201);
    await call(developer, 'POST', '/labels', { name: 'polish', color: 'purple' });
    const labels: Label[] = (await call(developer, 'GET', '/labels')).json();
    expect(labels.map((l) => [l.name, l.color])).toEqual([
      ['Bug', 'red'],
      ['polish', 'purple'],
    ]);
    [bug, polish] = labels as [Label, Label];
    // The project carries them, for pickers and filters.
    const project: ProjectDetail = (await call(developer, 'GET', '')).json();
    expect(project.labels).toEqual(labels);

    expect(
      (await call(developer, 'POST', '/labels', { name: 'BUG', color: 'blue' })).statusCode,
    ).toBe(409);
    expect(
      (await call(developer, 'POST', '/labels', { name: 'x', color: 'pink' })).statusCode,
    ).toBe(400);
    expect(
      (await call(developer, 'PATCH', `/labels/${bug.id}`, { name: 'Defect', color: 'red' }))
        .statusCode,
    ).toBe(403);
    expect((await call(developer, 'DELETE', `/labels/${bug.id}`)).statusCode).toBe(403);
    const renamed: Label[] = (
      await call(director, 'PATCH', `/labels/${bug.id}`, { name: 'Defect', color: 'orange' })
    ).json();
    expect(renamed.find((l) => l.id === bug.id)).toMatchObject({ name: 'Defect', color: 'orange' });
    expect(
      (await call(director, 'PATCH', `/labels/${bug.id}`, { name: 'Polish', color: 'red' }))
        .statusCode,
    ).toBe(409);
  });

  it('puts labels and a date on a task, where its card shows them', async () => {
    const res = await patch(developer, { labelIds: [polish.id, bug.id], dueDate: '2026-10-01' });
    expect(res.statusCode).toBe(200);
    expect(res.json().labels.map((l: Label) => l.name)).toEqual(['Defect', 'polish']);
    expect(res.json().dueDate).toBe('2026-10-01');
    const board: BoardView = (await call(developer, 'GET', '/board')).json();
    const card = Object.values(board.cards)
      .flat()
      .find((c) => c.id === taskId)!;
    expect(card).toMatchObject({ dueDate: '2026-10-01', blocked: false });
    expect(card.labels.map((l) => l.name)).toEqual(['Defect', 'polish']);

    // The list is the whole set: what is left out comes off. Another project's label is refused.
    expect((await patch(developer, { labelIds: [polish.id] })).json().labels).toHaveLength(1);
    expect(
      (await patch(developer, { labelIds: ['00000000-0000-4000-8000-000000000000'] })).statusCode,
    ).toBe(400);
    expect((await patch(developer, { dueDate: '2026-13-45' })).statusCode).toBe(400);
    expect((await patch(developer, { dueDate: null })).json().dueDate).toBeNull();
    // An edit that does not mention them leaves them alone.
    expect((await patch(developer, { title: 'Phase two, enraged' })).json().labels).toHaveLength(1);

    // A deleted label comes off the tasks that carried it.
    await call(director, 'DELETE', `/labels/${polish.id}`);
    expect((await task()).labels).toEqual([]);
  });

  it('flags a task as blocked with a reason, tells the Directors, and lifts the block when the task is finished', async () => {
    const mine = async (): Promise<NotificationSummary['notifications']> =>
      (
        (
          await t.app.inject({
            method: 'GET',
            url: '/api/notifications',
            headers: { cookie: director },
          })
        ).json() as NotificationSummary
      ).notifications.filter((n) => n.project.id === projectId);

    const res = await patch(developer, { blocked: true, blockedReason: '  Waiting for the rig  ' });
    expect(res.json()).toMatchObject({ blocked: true, blockedReason: 'Waiting for the rig' });
    expect((await mine())[0]).toMatchObject({
      kind: 'task.blocked',
      task: { id: taskId },
      detail: 'Waiting for the rig',
      actor: { displayName: 'Devin Developer' },
    });
    // The reason stays with the block through other edits, and changing it tells nobody again.
    expect((await patch(developer, { title: 'Phase two' })).json().blockedReason).toBe(
      'Waiting for the rig',
    );
    await patch(developer, { blockedReason: 'Rig arrives Friday' });
    expect((await mine()).filter((n) => n.kind === 'task.blocked')).toHaveLength(1);

    // Finished work is not blocked.
    const done: TaskDetail = (await call(developer, 'POST', `/tasks/${taskId}/complete`)).json();
    expect(done).toMatchObject({ completed: true, blocked: false, blockedReason: '' });
    expect((await patch(developer, { blocked: true })).statusCode).toBe(409);
    await call(developer, 'POST', `/tasks/${taskId}/reopen`);
    expect((await patch(developer, { blocked: true })).json().blocked).toBe(true);
    // Unblocking drops the reason.
    expect((await patch(developer, { blocked: false })).json()).toMatchObject({
      blocked: false,
      blockedReason: '',
    });
  });

  it('gives a Workboard an optional end date', async () => {
    const board = async (): Promise<BoardView> => (await call(developer, 'GET', '/board')).json();
    expect((await board()).endsOn).toBeNull();
    const set = await call(director, 'PATCH', `/boards/${boardId}`, {
      version: (await board()).version,
      endsOn: '2026-09-30',
    });
    expect(set.json().endsOn).toBe('2026-09-30');
    // A rename leaves it alone; null clears it; only a Director sets it.
    const renamed = await call(director, 'PATCH', `/boards/${boardId}`, {
      version: (await board()).version,
      name: 'Sprint 1',
    });
    expect(renamed.json()).toMatchObject({ name: 'Sprint 1', endsOn: '2026-09-30' });
    expect(
      (
        await call(developer, 'PATCH', `/boards/${boardId}`, {
          version: (await board()).version,
          endsOn: null,
        })
      ).statusCode,
    ).toBe(403);
    const cleared = await call(director, 'PATCH', `/boards/${boardId}`, {
      version: (await board()).version,
      endsOn: null,
    });
    expect(cleared.json().endsOn).toBeNull();
  });
});
