import type { BoardView, ProjectOverview } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('the project overview', () => {
  let t: TestContext;
  let director: string;
  let projectId: string;
  const ids: Record<string, string> = {};

  const send = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    t.app.inject({
      method,
      url: `/api/projects/${projectId}${url}`,
      headers: { cookie: director },
      ...(payload ? { payload } : {}),
    });

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    projectId = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: director },
        payload: { name: 'Overview' },
      })
    ).json().id;
    const item = async (title: string, category: string) =>
      (ids[title] = (await send('POST', '/backlog', { title, category })).json().id);
    const task = async (itemTitle: string, title: string, extra: object = {}) =>
      (ids[title] = (
        await send('POST', `/backlog/${ids[itemTitle]}/tasks`, {
          title,
          category: 'code',
          ...extra,
        })
      ).json().id);

    await item('Dash', 'must');
    await item('Grapple', 'should');
    await item('Photo mode', 'could');
    await item('Gone', 'could');
    const boardId = (await send('POST', '/boards', { name: 'Sprint' })).json().id;
    await send('POST', `/boards/${boardId}/scope`, { itemId: ids.Dash });
    // Tasks of an item in scope go straight to To Do.
    await task('Dash', 'Finished');
    await task('Dash', 'Doing');
    await task('Dash', 'Waiting');
    await task('Dash', 'Archived');
    const board: BoardView = (
      await send('POST', `/boards/${boardId}/columns`, { name: 'Making' })
    ).json();
    const making = board.columns.find((c) => c.name === 'Making')!.id;
    await send('POST', `/boards/${boardId}/placements/${ids.Doing}/move`, { columnId: making });
    await send('POST', `/tasks/${ids.Finished}/complete`);
    const archived = (await send('GET', `/tasks/${ids.Archived}`)).json();
    await send('PATCH', `/tasks/${ids.Archived}`, { version: archived.version, archived: true });

    const developer = (
      await send('POST', '/members', { email: 'developer@gameweld.local', roles: ['developer'] })
    ).json().userId;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await task('Grapple', 'Stuck', { category: 'assets' });
    const stuck = (await send('GET', `/tasks/${ids.Stuck}`)).json();
    await send('PATCH', `/tasks/${ids.Stuck}`, {
      version: stuck.version,
      blocked: true,
      blockedReason: 'No rope texture',
      dueDate: yesterday,
    });
    await task('Grapple', 'Assigned', { category: 'content', assigneeId: developer });

    const gone = (await send('GET', `/backlog/${ids.Gone}`)).json();
    await send('PATCH', `/backlog/${ids.Gone}`, { version: gone.version, archived: true });
  });
  afterAll(async () => {
    await t.close();
  });

  it('counts where every item’s tasks stand, in Backlog order', async () => {
    const res = await send('GET', '/overview');
    expect(res.statusCode).toBe(200);
    const overview: ProjectOverview = res.json();
    const none = { inProgress: 0, toDo: 0, unplaced: 0, blocked: 0, overdue: 0, unassigned: 0 };
    expect(overview.items).toEqual([
      {
        id: ids.Dash,
        title: 'Dash',
        category: 'must',
        state: 'open',
        onBoard: true,
        // The archived task is left out; the complete one is neither waiting nor unassigned.
        tasks: { ...none, total: 3, completed: 1, inProgress: 1, toDo: 1, unassigned: 2 },
      },
      {
        id: ids.Grapple,
        title: 'Grapple',
        category: 'should',
        state: 'open',
        onBoard: false,
        tasks: {
          ...none,
          total: 2,
          completed: 0,
          unplaced: 2,
          blocked: 1,
          overdue: 1,
          unassigned: 1,
        },
      },
      {
        id: ids['Photo mode'],
        title: 'Photo mode',
        category: 'could',
        state: 'open',
        onBoard: false,
        tasks: { ...none, total: 0, completed: 0 },
      },
    ]);
  });

  it('counts the same tasks by their category', async () => {
    const overview: ProjectOverview = (await send('GET', '/overview')).json();
    const none = {
      completed: 0,
      inProgress: 0,
      toDo: 0,
      unplaced: 0,
      blocked: 0,
      overdue: 0,
      unassigned: 0,
    };
    expect(overview.tasksByCategory).toEqual({
      code: { ...none, total: 3, completed: 1, inProgress: 1, toDo: 1, unassigned: 2 },
      assets: { ...none, total: 1, unplaced: 1, blocked: 1, overdue: 1, unassigned: 1 },
      content: { ...none, total: 1, unplaced: 1 },
    });
    // Every task is in exactly one place.
    for (const p of Object.values(overview.tasksByCategory))
      expect(p.completed + p.inProgress + p.toDo + p.unplaced).toBe(p.total);
  });
});
