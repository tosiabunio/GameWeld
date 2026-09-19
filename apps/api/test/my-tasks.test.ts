import type { MyTask, Task } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('my tasks', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let projectId: string;
  let itemId: string;
  let developerId: string;
  let directorId: string;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'My tasks' },
    });
    projectId = created.json().id;
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: director },
      payload: { email: 'developer@gameweld.local', roles: ['developer'] },
    });
    const me = (cookie: string) =>
      t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    developerId = (await me(developer)).json().id;
    directorId = (await me(director)).json().id;
    itemId = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title: 'Boss fight', category: 'must' },
      })
    ).json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  const createTask = async (title: string, assigneeId: string | null): Promise<Task> =>
    (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog/${itemId}/tasks`,
        headers: { cookie: director },
        payload: { title, category: 'code', assigneeId },
      })
    ).json();
  const myTasks = async (cookie: string): Promise<MyTask[]> =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/my-tasks`,
        headers: { cookie },
      })
    ).json();
  const titles = async (cookie: string) => (await myTasks(cookie)).map((task) => task.title);
  const move = (cookie: string, taskId: string, payload: object) =>
    t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/my-tasks/${taskId}/move`,
      headers: { cookie },
      payload,
    });
  const patch = async (task: Task, payload: object) => {
    const current = (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/tasks/${task.id}`,
        headers: { cookie: director },
      })
    ).json();
    return t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/tasks/${task.id}`,
      headers: { cookie: director },
      payload: { version: current.version, ...payload },
    });
  };

  let a: Task, b: Task, c: Task, d: Task;

  it('lists only the viewer’s unfinished tasks, oldest first until they are ordered', async () => {
    expect(await myTasks(developer)).toEqual([]);
    a = await createTask('Alpha', developerId);
    b = await createTask('Beta', developerId);
    c = await createTask('Gamma', developerId);
    await createTask('Nobody’s', null);
    await createTask('Director’s', directorId);

    const mine = await myTasks(developer);
    expect(mine.map((task) => task.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(mine[0]).toMatchObject({ itemTitle: 'Boss fight', itemCategory: 'must' });
    expect(await titles(director)).toEqual(['Director’s']);
  });

  it('moves a task between, before, and after its neighbours', async () => {
    const res = await move(developer, c.id, { beforeId: a.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((task: MyTask) => task.title)).toEqual(['Gamma', 'Alpha', 'Beta']);

    await move(developer, c.id, { afterId: a.id, beforeId: b.id });
    expect(await titles(developer)).toEqual(['Alpha', 'Gamma', 'Beta']);

    await move(developer, a.id, {});
    expect(await titles(developer)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('keeps each member’s order their own and puts new work at the end', async () => {
    d = await createTask('Delta', developerId);
    expect(await titles(developer)).toEqual(['Gamma', 'Beta', 'Alpha', 'Delta']);
    expect(await titles(director)).toEqual(['Director’s']);
    // Ordering is personal: it touches no task and leaves no trace in the project's history.
    const activity = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/activity?entityType=task&entityId=${c.id}`,
      headers: { cookie: director },
    });
    expect(activity.json().map((entry: { action: string }) => entry.action)).toEqual([
      'task.created',
    ]);
  });

  it('rejects tasks and neighbours that are not in the viewer’s list', async () => {
    expect((await move(director, a.id, {})).statusCode).toBe(404);
    expect((await move(developer, a.id, { afterId: a.id })).statusCode).toBe(400);
    expect((await move(developer, a.id, { afterId: 'nope' })).statusCode).toBe(400);
    const theirs = (await myTasks(director))[0]!;
    expect((await move(developer, a.id, { afterId: theirs.id })).statusCode).toBe(409);
    expect(await titles(developer)).toEqual(['Gamma', 'Beta', 'Alpha', 'Delta']);
  });

  it('drops finished, deleted, and reassigned tasks; a task handed back starts unordered', async () => {
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${b.id}/complete`,
      headers: { cookie: developer },
    });
    expect(await titles(developer)).toEqual(['Gamma', 'Alpha', 'Delta']);

    expect((await patch(d, { archived: true })).statusCode).toBe(200);
    expect(await titles(developer)).toEqual(['Gamma', 'Alpha']);

    expect((await patch(c, { assigneeId: directorId })).statusCode).toBe(200);
    expect(await titles(developer)).toEqual(['Alpha']);
    // Neither is ordered on the director's side, so the older task comes first.
    expect(await titles(director)).toEqual(['Gamma', 'Director’s']);

    // Gamma was first before it left; returning, it queues behind what is already ordered.
    expect((await patch(c, { assigneeId: developerId })).statusCode).toBe(200);
    expect(await titles(developer)).toEqual(['Alpha', 'Gamma']);
  });
});
