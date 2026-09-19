import type { Task, TaskDetail } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('tasks and breakdown', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let tester: string;
  let projectId: string;
  let projectVersion: number;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    tester = await signInAs(t.app, 'tester');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Tasks' },
    });
    projectId = created.json().id;
    projectVersion = created.json().version;
    for (const role of ['developer', 'tester'] as const) {
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/members`,
        headers: { cookie: director },
        payload: { email: `${role}@gameweld.local`, roles: [role] },
      });
    }
  });
  afterAll(async () => {
    await t.close();
  });

  const createItem = async (title: string) =>
    (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title, category: 'must' },
      })
    ).json();
  const itemState = async (itemId: string) =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/backlog/${itemId}`,
        headers: { cookie: director },
      })
    ).json().state;
  const createTask = (itemId: string, payload: object, cookie = developer) =>
    t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/backlog/${itemId}/tasks`,
      headers: { cookie },
      payload,
    });
  const listTasks = async (itemId: string): Promise<Task[]> =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/backlog/${itemId}/tasks`,
        headers: { cookie: tester },
      })
    ).json();
  const complete = (taskId: string, cookie = developer) =>
    t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${taskId}/complete`,
      headers: { cookie },
    });
  const reopen = (taskId: string, cookie = developer) =>
    t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tasks/${taskId}/reopen`,
      headers: { cookie },
    });
  const patch = (taskId: string, payload: object, cookie = developer) =>
    t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}/tasks/${taskId}`,
      headers: { cookie },
      payload,
    });

  it('lets any member create tasks under an item, unplaced and grouped by category', async () => {
    const item = await createItem('Mixed item');
    const code = await createTask(item.id, { category: 'code', title: 'Targeting' });
    expect(code.statusCode).toBe(201);
    expect(code.json()).toMatchObject({
      category: 'code',
      title: 'Targeting',
      completed: false,
      placement: null,
      assignee: null,
    });
    expect(
      (await createTask(item.id, { category: 'assets', title: 'Animation' }, tester)).statusCode,
    ).toBe(201);
    expect(
      (await createTask(item.id, { category: 'content', title: 'Place it' }, director)).statusCode,
    ).toBe(201);
    expect((await createTask(item.id, { category: 'code', title: '' })).statusCode).toBe(400);

    const tasks = await listTasks(item.id);
    expect(tasks.map((x) => x.category)).toEqual(['code', 'assets', 'content']);
    expect(await itemState(item.id)).toBe('open');
    const backlog = (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: developer },
      })
    ).json();
    expect(backlog.find((i: { id: string }) => i.id === item.id).taskCounts).toEqual({
      total: 3,
      completed: 0,
    });
  });

  it('Section 15 "Item contains only Code tasks" and "All tasks of an item finish"', async () => {
    const item = await createItem('Code only');
    const a = (await createTask(item.id, { category: 'code', title: 'Part A' })).json();
    const b = (await createTask(item.id, { category: 'code', title: 'Part B' })).json();
    expect(await itemState(item.id)).toBe('open');

    expect((await complete(a.id)).statusCode).toBe(200);
    expect(await itemState(item.id)).toBe('open');
    const done = await complete(b.id);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ completed: true, item: { state: 'ready_for_review' } });
    // Ready for Review, not Done: acceptance is a separate action (Phase 5).
    expect(await itemState(item.id)).toBe('ready_for_review');

    const activity = await t.db.query(
      `SELECT action FROM activity WHERE entity_id = $1 ORDER BY id`,
      [item.id],
    );
    expect(activity.rows.map((r) => r.action)).toContain('item.ready_for_review');
  });

  it('Section 15 "Item contains only Content tasks": no placeholder Code or Assets tasks needed', async () => {
    const item = await createItem('Content only');
    const only = (
      await createTask(item.id, { category: 'content', title: 'Tune the encounter' })
    ).json();
    expect((await listTasks(item.id)).map((x) => x.category)).toEqual(['content']);
    await complete(only.id);
    expect(await itemState(item.id)).toBe('ready_for_review');
  });

  it('an empty item never becomes ready, and adding an unfinished task reopens a ready item', async () => {
    const empty = await createItem('Empty');
    expect(await itemState(empty.id)).toBe('open');

    const item = await createItem('Reopens');
    const a = (await createTask(item.id, { category: 'assets', title: 'A' })).json();
    await complete(a.id);
    expect(await itemState(item.id)).toBe('ready_for_review');
    await createTask(item.id, { category: 'assets', title: 'B' });
    expect(await itemState(item.id)).toBe('open');
  });

  it('reopening a task returns the item to Open; archived tasks are excluded from the check', async () => {
    const item = await createItem('Archive rules');
    const a = (await createTask(item.id, { category: 'code', title: 'A' })).json();
    const b = (await createTask(item.id, { category: 'code', title: 'B' })).json();
    await complete(a.id);
    await complete(b.id);
    expect(await itemState(item.id)).toBe('ready_for_review');

    const reopened = await reopen(b.id);
    expect(reopened.statusCode).toBe(200);
    expect(await itemState(item.id)).toBe('open');

    // Archiving the unfinished task (Director only) leaves one completed task: ready again.
    expect(
      (await patch(b.id, { version: reopened.json().version, archived: true })).statusCode,
    ).toBe(403);
    const archived = await patch(
      b.id,
      { version: reopened.json().version, archived: true },
      director,
    );
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archived).toBe(true);
    expect(await itemState(item.id)).toBe('ready_for_review');
    // But an item whose only tasks are archived is not ready.
    const detailA = (
      await patch(
        a.id,
        { version: (await complete(a.id)).json().version, archived: true },
        director,
      )
    ).json();
    expect(detailA.archived).toBe(true);
    expect(await itemState(item.id)).toBe('open');
  });

  it('applies the Done restriction to completing and reopening (R2)', async () => {
    await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { cookie: director },
      payload: { version: projectVersion, doneRestricted: true },
    });
    projectVersion += 1;
    const item = await createItem('Restricted');
    const task = (await createTask(item.id, { category: 'code', title: 'Guarded' })).json();
    expect((await complete(task.id, developer)).statusCode).toBe(403);
    expect((await complete(task.id, director)).statusCode).toBe(403);
    expect((await complete(task.id, tester)).statusCode).toBe(200);
    expect((await reopen(task.id, developer)).statusCode).toBe(403);
    expect((await reopen(task.id, tester)).statusCode).toBe(200);
    await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { cookie: director },
      payload: { version: projectVersion, doneRestricted: false },
    });
    projectVersion += 1;
  });

  it('edits content and assignment with optimistic concurrency; assignee must be a member', async () => {
    const item = await createItem('Editing');
    const task = (await createTask(item.id, { category: 'assets', title: 'Draft' })).json();
    const devId = (
      await t.db.query<{ id: string }>(
        `SELECT id FROM users WHERE email = 'developer@gameweld.local'`,
      )
    ).rows[0]!.id;
    const ok = await patch(
      task.id,
      { version: task.version, title: 'Final', description: 'Notes', assigneeId: devId },
      tester,
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      title: 'Final',
      description: 'Notes',
      assignee: { id: devId, displayName: 'Devin Developer' },
      item: { id: item.id },
    });
    expect((await patch(task.id, { version: task.version, title: 'Stale' })).statusCode).toBe(409);
    const outsider = (
      await t.db.query<{ id: string }>(
        `INSERT INTO users (display_name, email) VALUES ('Outsider', 'out@gameweld.local') RETURNING id`,
      )
    ).rows[0]!.id;
    expect(
      (await patch(task.id, { version: ok.json().version, assigneeId: outsider })).statusCode,
    ).toBe(400);
    const cleared = await patch(task.id, { version: ok.json().version, assigneeId: null });
    expect(cleared.json().assignee).toBeNull();
  });

  it('reparenting is a Director action that recalculates both items', async () => {
    const from = await createItem('From');
    const to = await createItem('To');
    const a = (await createTask(from.id, { category: 'code', title: 'Done one' })).json();
    const b = (await createTask(from.id, { category: 'code', title: 'Moving' })).json();
    await complete(a.id);
    expect(await itemState(from.id)).toBe('open');

    expect((await patch(b.id, { version: b.version, itemId: to.id })).statusCode).toBe(403);
    const moved = await patch(b.id, { version: b.version, itemId: to.id }, director);
    expect(moved.statusCode).toBe(200);
    expect((moved.json() as TaskDetail).item.id).toBe(to.id);
    expect(await itemState(from.id)).toBe('ready_for_review'); // only the completed task remains
    expect(await itemState(to.id)).toBe('open');
    expect(
      (
        await patch(
          b.id,
          { version: moved.json().version, itemId: '00000000-0000-0000-0000-000000000000' },
          director,
        )
      ).statusCode,
    ).toBe(404);
  });

  it('keeps board placement consistent: completing moves to Done, reopening back to To Do, category locked while placed', async () => {
    // In this file's own project: other test files read the Demo project's board while this runs.
    const demo = projectId;
    const item = await createItem('Placed work');
    const boardId = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/boards`,
        headers: { cookie: director },
        payload: { name: 'September production' },
      })
    ).json().id;
    // Straight into the scope: the priority rule is not what this test is about.
    await t.db.query('INSERT INTO workboard_scope (board_id, item_id) VALUES ($1, $2)', [
      boardId,
      item.id,
    ]);
    const targeting = (await createTask(item.id, { category: 'code', title: 'Targeting' })).json()
      .id as string;
    const before: TaskDetail = (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${demo}/tasks/${targeting}`,
        headers: { cookie: developer },
      })
    ).json();
    expect(before.placement).toMatchObject({
      boardName: 'September production',
      columnName: 'To Do · Code',
      inDone: false,
    });

    const locked = await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${demo}/tasks/${targeting}`,
      headers: { cookie: developer },
      payload: { version: before.version, category: 'assets' },
    });
    expect(locked.statusCode).toBe(409);

    const done: TaskDetail = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${demo}/tasks/${targeting}/complete`,
        headers: { cookie: developer },
      })
    ).json();
    expect(done.completed).toBe(true);
    expect(done.placement).toMatchObject({ columnName: 'Done', inDone: true });

    const back: TaskDetail = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${demo}/tasks/${targeting}/reopen`,
        headers: { cookie: developer },
      })
    ).json();
    expect(back.completed).toBe(false);
    expect(back.placement).toMatchObject({ columnName: 'To Do · Code', inDone: false });

    // Deletion removes an unfinished task from the board and completion checks.
    const archive = await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${demo}/tasks/${targeting}`,
      headers: { cookie: director },
      payload: { version: back.version, archived: true },
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json()).toMatchObject({ archived: true, completed: false, placement: null });
    const history = await t.db.query(
      'SELECT is_current, removed_reason, last_column_id FROM task_placements WHERE task_id = $1',
      [targeting],
    );
    expect(history.rows).toContainEqual({
      is_current: false,
      removed_reason: 'task deleted',
      last_column_id: back.placement!.columnId,
    });
    // Restoring an unfinished task under an in-scope item puts it straight back in To Do.
    const restored = await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${demo}/tasks/${targeting}`,
      headers: { cookie: director },
      payload: { version: archive.json().version, archived: false },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({
      archived: false,
      completed: false,
      placement: { boardId: back.placement!.boardId, columnName: 'To Do · Code' },
    });
  });
});
