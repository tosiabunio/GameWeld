import type { BoardView } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('workboard', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let tester: string;
  let projectId: string;
  let projectVersion: number;
  let boardId: string;
  const items: Record<string, string> = {};
  const tasks: Record<string, string> = {};

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    tester = await signInAs(t.app, 'tester');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Board', scopeLimit: 2 },
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
    for (const [title, category] of [
      ['Ranged enemy', 'must'],
      ['Flying enemy', 'must'],
      ['Boss arena', 'should'],
      ['Nice to have', 'could'],
      ['Cut idea', 'wont'],
    ] as const) {
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title, category },
      });
      items[title] = res.json().id;
    }
    for (const [item, category, title] of [
      ['Ranged enemy', 'code', 'Targeting'],
      ['Ranged enemy', 'assets', 'Attack animation'],
      ['Ranged enemy', 'content', 'Place the enemy'],
      ['Flying enemy', 'assets', 'Swoop animation'],
      ['Boss arena', 'content', 'Dress the arena'],
    ] as const) {
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog/${items[item]}/tasks`,
        headers: { cookie: developer },
        payload: { category, title },
      });
      tasks[title] = res.json().id;
    }
  });
  afterAll(async () => {
    await t.close();
  });

  const boards = () => `/api/projects/${projectId}/boards`;
  const post = (url: string, payload: object | undefined, cookie = director) =>
    t.app.inject({ method: 'POST', url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const board = async (cookie = developer): Promise<BoardView> =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/board`,
        headers: { cookie },
      })
    ).json();
  const column = (b: BoardView, kind: string) => b.columns.find((c) => c.kind === kind)!;
  const cardTitles = (b: BoardView, kind: string) =>
    b.cards[column(b, kind).id]!.map((c) => c.title);
  const move = (taskId: string, columnId: string, cookie = developer, extra: object = {}) =>
    post(`${boards()}/${boardId}/placements/${taskId}/move`, { columnId, ...extra }, cookie);

  it('a Director creates the one active board with the standard columns', async () => {
    expect(await board()).toBeNull();
    expect((await post(boards(), { name: 'Nope' }, developer)).statusCode).toBe(403);
    const res = await post(boards(), { name: 'September production' });
    expect(res.statusCode).toBe(201);
    const b: BoardView = res.json();
    boardId = b.id;
    expect(b.columns.map((c) => c.kind)).toEqual([
      'todo_code',
      'todo_assets',
      'todo_content',
      'done',
    ]);
    expect(b.counts).toEqual({
      scopeItems: 0,
      acceptedItems: 0,
      outOfScopeTasks: 0,
      placedTasks: 0,
      unfinishedTasks: 0,
      pendingRequests: 0,
    });
    expect(b.nextEligible?.title).toBe('Ranged enemy');
    expect((await post(boards(), { name: 'Second' })).statusCode).toBe(409); // D1
  });

  it('Section 15 "Director activates a permitted item": tasks enter their To Do columns', async () => {
    // D7: a Won't Have item is out, not later, and does not come in.
    const cut = await post(`${boards()}/${boardId}/scope`, { itemId: items['Cut idea'] });
    expect(cut.statusCode).toBe(409);
    expect(cut.json().message).toMatch(/Won’t Have/);
    expect(
      (await post(`${boards()}/${boardId}/scope`, { itemId: items['Ranged enemy'] }, developer))
        .statusCode,
    ).toBe(403);

    const res = await post(`${boards()}/${boardId}/scope`, { itemId: items['Ranged enemy'] });
    expect(res.statusCode).toBe(201);
    const b: BoardView = res.json();
    expect(cardTitles(b, 'todo_code')).toEqual(['Targeting']);
    expect(cardTitles(b, 'todo_assets')).toEqual(['Attack animation']);
    expect(cardTitles(b, 'todo_content')).toEqual(['Place the enemy']);
    expect(b.scope.map((s) => s.title)).toEqual(['Ranged enemy']);
    expect(b.counts.scopeItems).toBe(1);
    expect(b.nextEligible?.title).toBe('Flying enemy');
    // The item remains in the Backlog with a board badge.
    const backlog = (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: developer },
      })
    ).json();
    expect(
      backlog.find((i: { id: string }) => i.id === items['Ranged enemy']).activeBoard.name,
    ).toBe('September production');
  });

  it('D7: the Director may bring in another item than the next in priority', async () => {
    const own = (await post('/api/projects', { name: 'Free choice' })).json<{ id: string }>().id;
    const url = `/api/projects/${own}`;
    const first = (await post(`${url}/backlog`, { title: 'First', category: 'must' })).json();
    const later = (await post(`${url}/backlog`, { title: 'Later', category: 'could' })).json();
    const b = (await post(`${url}/boards`, { name: 'Now' })).json();
    const res = await post(`${url}/boards/${b.id}/scope`, { itemId: later.id });
    expect(res.statusCode).toBe(201);
    const view: BoardView = res.json();
    expect(view.scope.map((s) => s.title)).toEqual(['Later']);
    // The suggestion still follows the priorities.
    expect(view.nextEligible?.id).toBe(first.id);
  });

  it('Section 15 "Developer creates a card with one item in scope": parent defaults', async () => {
    const res = await post(
      `${boards()}/${boardId}/tasks`,
      { category: 'code', title: 'Hit reaction' },
      developer,
    );
    expect(res.statusCode).toBe(201);
    const b: BoardView = res.json();
    const card = b.cards[column(b, 'todo_code').id]!.find((c) => c.title === 'Hit reaction')!;
    expect(card.itemTitle).toBe('Ranged enemy');
    expect(card.outOfScope).toBe(false);
    tasks['Hit reaction'] = card.id;
  });

  it('Section 15 "User exceeds the configured scope limit": activation is rejected clearly', async () => {
    expect(
      (await post(`${boards()}/${boardId}/scope`, { itemId: items['Flying enemy'] })).statusCode,
    ).toBe(201);
    const over = await post(`${boards()}/${boardId}/scope`, { itemId: items['Boss arena'] });
    expect(over.statusCode).toBe(409);
    expect(over.json().message).toMatch(/2 of 2 items/);
    expect((await board()).nextEligible).toBeNull();
  });

  it('Section 15 "Developer creates a card with several items in scope": a parent is required', async () => {
    const missing = await post(
      `${boards()}/${boardId}/tasks`,
      { category: 'content', title: 'Orphan' },
      developer,
    );
    expect(missing.statusCode).toBe(400);
    expect(missing.json().message).toMatch(/Choose the backlog item/);
    const ok = await post(
      `${boards()}/${boardId}/tasks`,
      { itemId: items['Flying enemy'], category: 'content', title: 'Flight lane' },
      developer,
    );
    expect(ok.statusCode).toBe(201);
    // Out-of-scope parent: a Developer may not place directly (requests arrive in Phase 6), a Director may.
    const dev = await post(
      `${boards()}/${boardId}/tasks`,
      { itemId: items['Boss arena'], category: 'content', title: 'Arena light' },
      developer,
    );
    expect(dev.statusCode).toBe(403);
    const dir = await post(`${boards()}/${boardId}/tasks`, {
      itemId: items['Boss arena'],
      category: 'content',
      title: 'Arena light',
    });
    expect(dir.statusCode).toBe(201);
    const b: BoardView = dir.json();
    const card = b.cards[column(b, 'todo_content').id]!.find((c) => c.title === 'Arena light')!;
    expect(card.outOfScope).toBe(true);
    expect(card.placement?.enteredAsException).toBe(true);
    expect(b.counts.outOfScopeTasks).toBe(1);
    tasks['Arena light'] = card.id;
  });

  it('D8 (revised): tasks created under in-scope items are placed at once and cannot be individually unplaced', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/backlog/${items['Ranged enemy']}/tasks`,
      headers: { cookie: tester },
      payload: { category: 'assets', title: 'Death animation' },
    });
    const taskId = created.json().id;
    expect(created.json().placement).toMatchObject({ boardId, columnName: 'To Do · Assets' });
    expect(cardTitles(await board(), 'todo_assets')).toContain('Death animation');
    expect((await post(`${boards()}/${boardId}/placements`, { taskId }, tester)).statusCode).toBe(
      409,
    );
    expect(
      (await post(`${boards()}/${boardId}/placements/${taskId}/return`, undefined, tester))
        .statusCode,
    ).toBe(404);
    expect(cardTitles(await board(), 'todo_assets')).toContain('Death animation');
    // A task under an item outside scope stays unplaced; placing it needs a Director.
    const outsideTask = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog/${items['Boss arena']}/tasks`,
        headers: { cookie: developer },
        payload: { category: 'content', title: 'Dress the arena 2' },
      })
    ).json();
    expect(outsideTask.placement).toBeNull();
    expect(
      (await post(`${boards()}/${boardId}/placements`, { taskId: outsideTask.id }, developer))
        .statusCode,
    ).toBe(403);
  });

  it('Section 15 "Team renames an intermediate column": no rules change; empty columns delete', async () => {
    const added = await post(`${boards()}/${boardId}/columns`, { name: 'Making' });
    expect(added.statusCode).toBe(201);
    let b: BoardView = added.json();
    expect(b.columns.map((c) => c.name)).toEqual([
      'To Do · Code',
      'To Do · Assets',
      'To Do · Content',
      'Making',
      'Done',
    ]);
    const making = b.columns.find((c) => c.name === 'Making')!;
    const renamed = await t.app.inject({
      method: 'PATCH',
      url: `${boards()}/${boardId}/columns/${making.id}`,
      headers: { cookie: director },
      payload: { version: making.version, name: 'In Progress' },
    });
    expect(renamed.statusCode).toBe(200);
    b = renamed.json();
    expect(b.columns.find((c) => c.id === making.id)).toMatchObject({
      name: 'In Progress',
      kind: 'intermediate',
    });

    // Movement can skip intermediate columns, and an occupied column cannot be deleted.
    expect((await move(tasks['Targeting']!, making.id)).statusCode).toBe(200);
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: `${boards()}/${boardId}/columns/${making.id}`,
          headers: { cookie: director },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: `${boards()}/${boardId}/columns/${column(b, 'done').id}`,
          headers: { cookie: director },
        })
      ).statusCode,
    ).toBe(409);
    b = await board();
    expect((await move(tasks['Targeting']!, column(b, 'todo_code').id)).statusCode).toBe(200);
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: `${boards()}/${boardId}/columns/${making.id}`,
          headers: { cookie: director },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('keeps To Do columns category-specific and orders cards within a column', async () => {
    let b = await board();
    expect((await move(tasks['Targeting']!, column(b, 'todo_assets').id)).statusCode).toBe(409);
    // Hit reaction above Targeting in To Do · Code.
    const res = await move(tasks['Hit reaction']!, column(b, 'todo_code').id, developer, {
      beforeId: tasks['Targeting'],
    });
    expect(res.statusCode).toBe(200);
    b = res.json();
    expect(cardTitles(b, 'todo_code')).toEqual(['Hit reaction', 'Targeting']);
  });

  it('moving into Done completes the task and readiness follows; out of Done reopens it', async () => {
    let b = await board();
    const done = column(b, 'done').id;
    for (const title of [
      'Targeting',
      'Hit reaction',
      'Attack animation',
      'Place the enemy',
      'Death animation',
    ]) {
      const id = b.cards[
        column(
          b,
          title === 'Attack animation' || title === 'Death animation'
            ? 'todo_assets'
            : title === 'Place the enemy'
              ? 'todo_content'
              : 'todo_code',
        ).id
      ]!.find((c) => c.title === title)!.id;
      const res = await move(id, done, developer);
      expect(res.statusCode, title).toBe(200);
      b = res.json();
    }
    expect(b.cards[done]!.every((c) => c.completed)).toBe(true);
    expect(b.scope.find((s) => s.title === 'Ranged enemy')?.state).toBe('ready_for_review');
    expect(b.counts.unfinishedTasks).toBe(b.counts.placedTasks - 5);

    const targeting = b.cards[done]!.find((c) => c.title === 'Targeting')!;
    const back = await move(targeting.id, column(b, 'todo_code').id, developer);
    expect(back.statusCode).toBe(200);
    b = back.json();
    expect(b.cards[column(b, 'todo_code').id]!.find((c) => c.id === targeting.id)?.completed).toBe(
      false,
    );
    expect(b.scope.find((s) => s.title === 'Ranged enemy')?.state).toBe('open');
  });

  it('Section 15 "Done restriction is enabled": Developers cannot enter or leave Done, Testers can', async () => {
    await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { cookie: director },
      payload: { version: projectVersion, doneRestricted: true },
    });
    projectVersion += 1;
    const b = await board();
    const done = column(b, 'done').id;
    const targeting = b.cards[column(b, 'todo_code').id]!.find((c) => c.title === 'Targeting')!;
    expect((await move(targeting.id, done, developer)).statusCode).toBe(403);
    expect((await move(targeting.id, done, director)).statusCode).toBe(403);
    expect((await move(targeting.id, done, tester)).statusCode).toBe(200);
    const finished = (await board()).cards[done]!.find((c) => c.title === 'Attack animation')!;
    expect((await move(finished.id, column(b, 'todo_assets').id, developer)).statusCode).toBe(403);
    expect((await move(finished.id, column(b, 'todo_assets').id, tester)).statusCode).toBe(200);
    await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { cookie: director },
      payload: { version: projectVersion, doneRestricted: false },
    });
    projectVersion += 1;
  });

  it('removing an item from scope offers return-to-Breakdown or keep-as-exception (Section 12, R5)', async () => {
    let b = await board();
    const flightLane = b.cards[column(b, 'todo_content').id]!.find(
      (c) => c.title === 'Flight lane',
    )!;
    const swoop = b.cards[column(b, 'todo_assets').id]!.find((c) => c.title === 'Swoop animation')!;
    // Keep tasks as exceptions.
    const kept = await post(`${boards()}/${boardId}/scope/${items['Flying enemy']}/remove`, {
      returnTasks: false,
    });
    expect(kept.statusCode).toBe(200);
    b = kept.json();
    expect(b.scope.map((s) => s.title)).toEqual(['Ranged enemy']);
    expect(
      b.cards[column(b, 'todo_content').id]!.find((c) => c.id === flightLane.id)?.outOfScope,
    ).toBe(true);
    expect(b.counts.outOfScopeTasks).toBeGreaterThanOrEqual(2);
    // Re-activating the item makes the badge disappear (Section 9).
    b = (await post(`${boards()}/${boardId}/scope`, { itemId: items['Flying enemy'] })).json();
    expect(b.cards[column(b, 'todo_assets').id]!.find((c) => c.id === swoop.id)?.outOfScope).toBe(
      false,
    );
    // Return tasks: they leave the board and their column position is discarded.
    b = (
      await post(`${boards()}/${boardId}/scope/${items['Flying enemy']}/remove`, {
        returnTasks: true,
      })
    ).json();
    expect(
      Object.values(b.cards)
        .flat()
        .some((c) => c.id === swoop.id),
    ).toBe(false);
    const history = await t.db.query(
      `SELECT removed_reason, last_column_id FROM task_placements WHERE task_id = $1 AND NOT is_current`,
      [swoop.id],
    );
    expect(history.rows[0]).toMatchObject({ removed_reason: 'item removed from scope' });
    expect(history.rows[0].last_column_id).not.toBeNull();
    expect(
      (
        await post(`${boards()}/${boardId}/scope/${items['Flying enemy']}/remove`, {
          returnTasks: true,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('archives the board only after unfinished tasks are explicitly returned (D12)', async () => {
    const blocked = await post(`${boards()}/${boardId}/archive`, {});
    expect(blocked.statusCode).toBe(409);
    const unfinished = (await board()).counts.unfinishedTasks;
    expect(blocked.json().details.unfinishedTasks).toBe(unfinished);
    const archived = await post(`${boards()}/${boardId}/archive`, { returnUnfinished: true });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().state).toBe('archived');
    expect(archived.json().counts.unfinishedTasks).toBe(0);
    expect(archived.json().counts.placedTasks).toBeGreaterThan(0); // completed cards stay as history
    expect(await board()).toBeNull();
    const list = (
      await t.app.inject({ method: 'GET', url: boards(), headers: { cookie: developer } })
    ).json();
    expect(list[0]).toMatchObject({ name: 'September production', state: 'archived' });
    // Archived boards are read-only.
    expect((await post(`${boards()}/${boardId}/columns`, { name: 'Late' })).statusCode).toBe(409);
    // No task was completed by archival.
    const taskCount = await t.db.query(
      `SELECT count(*)::int AS n FROM tasks WHERE project_id = $1 AND NOT completed AND archived_at IS NULL`,
      [projectId],
    );
    expect(taskCount.rows[0].n).toBeGreaterThan(0);
  });
});
