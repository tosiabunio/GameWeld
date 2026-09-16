import type { BacklogItem } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('backlog', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let projectId: string;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Backlog' },
    });
    projectId = created.json().id;
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: director },
      payload: { email: 'developer@gameweld.local', roles: ['developer'] },
    });
  });
  afterAll(async () => {
    await t.close();
  });

  const base = () => `/api/projects/${projectId}/backlog`;
  const create = (payload: object, cookie = director) =>
    t.app.inject({ method: 'POST', url: base(), headers: { cookie }, payload });
  const list = async (cookie = director): Promise<BacklogItem[]> =>
    (await t.app.inject({ method: 'GET', url: base(), headers: { cookie } })).json();
  const move = (itemId: string, payload: object, cookie = director) =>
    t.app.inject({ method: 'POST', url: `${base()}/${itemId}/move`, headers: { cookie }, payload });
  const titles = (items: BacklogItem[], category: string) =>
    items.filter((i) => i.category === category).map((i) => i.title);

  it('Section 15: a vague or very large item is accepted without estimates or acceptance criteria', async () => {
    const vague = await create({ title: 'Make combat feel better', category: 'must' });
    expect(vague.statusCode).toBe(201);
    expect(vague.json()).toMatchObject({
      title: 'Make combat feel better',
      description: '',
      category: 'must',
      state: 'open',
      taskCounts: { total: 0, completed: 0 },
      activeBoard: null,
    });

    const huge = await create({
      title: 'Whole open world',
      description: 'x'.repeat(40_000),
      category: 'could',
    });
    expect(huge.statusCode).toBe(201);
    expect(huge.json().description).toHaveLength(40_000);
  });

  it('appends new items at the end of their category and lists them in order', async () => {
    await create({ title: 'Second must', category: 'must' });
    await create({ title: 'Third must', category: 'must' });
    const items = await list(developer);
    expect(titles(items, 'must')).toEqual(['Make combat feel better', 'Second must', 'Third must']);
    const ranks = items.filter((i) => i.category === 'must').map((i) => i.rank);
    expect([...ranks].sort()).toEqual(ranks);
  });

  it('only Directors create, edit, or move items', async () => {
    expect((await create({ title: 'Nope', category: 'must' }, developer)).statusCode).toBe(403);
    const [first] = await list();
    expect((await move(first!.id, { category: 'should' }, developer)).statusCode).toBe(403);
    const patch = await t.app.inject({
      method: 'PATCH',
      url: `${base()}/${first!.id}`,
      headers: { cookie: developer },
      payload: { version: first!.version, title: 'Nope' },
    });
    expect(patch.statusCode).toBe(403);
  });

  it('reorders within a category and moves across categories', async () => {
    let items = await list();
    const [a, b, c] = items.filter((i) => i.category === 'must');
    // Move c between a and b.
    expect(
      (await move(c!.id, { category: 'must', afterId: a!.id, beforeId: b!.id })).statusCode,
    ).toBe(200);
    items = await list();
    expect(titles(items, 'must')).toEqual(['Make combat feel better', 'Third must', 'Second must']);

    // Move a to the top of Should Have (before nothing, after nothing = end of empty lane).
    expect((await move(a!.id, { category: 'should' })).statusCode).toBe(200);
    items = await list();
    expect(titles(items, 'should')).toEqual(['Make combat feel better']);
    expect(titles(items, 'must')).toEqual(['Third must', 'Second must']);

    const activity = await t.db.query(
      `SELECT action FROM activity WHERE entity_id = $1 ORDER BY id`,
      [a!.id],
    );
    expect(activity.rows.map((r) => r.action)).toEqual(['item.created', 'item.recategorized']);
  });

  it('rejects placement next to an item that left the lane, or next to itself', async () => {
    const items = await list();
    const should = items.find((i) => i.category === 'should')!;
    const must = items.find((i) => i.category === 'must')!;
    expect((await move(must.id, { category: 'must', afterId: should.id })).statusCode).toBe(409);
    expect((await move(must.id, { category: 'must', afterId: must.id })).statusCode).toBe(400);
  });

  it('ordering survives concurrent moves (plan Phase 2 exit criterion)', async () => {
    const created: string[] = [];
    for (let i = 0; i < 8; i++)
      created.push((await create({ title: `Concurrent ${i}`, category: 'wont' })).json().id);
    // Everyone tries to move to the top at once: after nothing, before the current first item.
    const first = created[0]!;
    const results = await Promise.all(
      created.slice(1).map((id) => move(id, { category: 'wont', beforeId: first })),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(7).fill(200));

    const items = (await list()).filter((i) => i.category === 'wont');
    const ranks = items.map((i) => i.rank);
    expect(new Set(ranks).size).toBe(ranks.length); // no two items share a rank
    expect([...ranks].sort()).toEqual(ranks); // list order is rank order
    expect(items[items.length - 1]!.id).toBe(first); // the original first item is now last
  });

  it('edits title and description with optimistic concurrency', async () => {
    const item = (await create({ title: 'Edit me', category: 'could' })).json();
    const ok = await t.app.inject({
      method: 'PATCH',
      url: `${base()}/${item.id}`,
      headers: { cookie: director },
      payload: { version: item.version, description: 'Now with a description' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      description: 'Now with a description',
      version: item.version + 1,
    });
    const stale = await t.app.inject({
      method: 'PATCH',
      url: `${base()}/${item.id}`,
      headers: { cookie: director },
      payload: { version: item.version, title: 'Stale' },
    });
    expect(stale.statusCode).toBe(409);
  });

  it('manages links on an item', async () => {
    const item = (await create({ title: 'Linked', category: 'could' })).json();
    const added = await t.app.inject({
      method: 'POST',
      url: `${base()}/${item.id}/links`,
      headers: { cookie: director },
      payload: { url: 'https://example.com/design.pdf', label: 'Design doc' },
    });
    expect(added.statusCode).toBe(201);
    const detail = await t.app.inject({
      method: 'GET',
      url: `${base()}/${item.id}`,
      headers: { cookie: developer },
    });
    expect(detail.json().links).toEqual([
      { id: added.json().id, url: 'https://example.com/design.pdf', label: 'Design doc' },
    ]);
    const bad = await t.app.inject({
      method: 'POST',
      url: `${base()}/${item.id}/links`,
      headers: { cookie: director },
      payload: { url: 'not a url' },
    });
    expect(bad.statusCode).toBe(400);
    const removed = await t.app.inject({
      method: 'DELETE',
      url: `${base()}/${item.id}/links/${added.json().id}`,
      headers: { cookie: director },
    });
    expect(removed.statusCode).toBe(204);
    const again = await t.app.inject({
      method: 'GET',
      url: `${base()}/${item.id}`,
      headers: { cookie: director },
    });
    expect(again.json().links).toEqual([]);
  });

  it('archives an item, hides it from the list, and blocks archiving with tasks on a board', async () => {
    const item = (await create({ title: 'Old idea', category: 'wont' })).json();
    const archived = await t.app.inject({
      method: 'PATCH',
      url: `${base()}/${item.id}`,
      headers: { cookie: director },
      payload: { version: item.version, archived: true },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archived).toBe(true);
    expect((await list()).some((i) => i.id === item.id)).toBe(false);
    expect((await move(item.id, { category: 'must' })).statusCode).toBe(404);

    // The seeded Ranged enemy has tasks placed on the active board.
    const demo = (
      await t.db.query<{ id: string; project_id: string; version: number }>(
        `SELECT id, project_id, version FROM backlog_items WHERE title = 'Ranged enemy'`,
      )
    ).rows[0]!;
    const blocked = await t.app.inject({
      method: 'PATCH',
      url: `/api/projects/${demo.project_id}/backlog/${demo.id}`,
      headers: { cookie: director },
      payload: { version: demo.version, archived: true },
    });
    expect(blocked.statusCode).toBe(409);
  });

  it('reports task counts and the active board badge for seeded items', async () => {
    const demoProject = (
      await t.db.query<{ id: string }>(`SELECT id FROM projects WHERE name = 'Demo project'`)
    ).rows[0]!.id;
    const items: BacklogItem[] = (
      await t.app.inject({
        method: 'GET',
        url: `/api/projects/${demoProject}/backlog`,
        headers: { cookie: developer },
      })
    ).json();
    const ranged = items.find((i) => i.title === 'Ranged enemy')!;
    expect(ranged.taskCounts).toEqual({ total: 3, completed: 0 });
    expect(ranged.activeBoard?.name).toBe('September production');
    const flying = items.find((i) => i.title === 'Flying enemy')!;
    expect(flying.activeBoard).toBeNull();
  });
});
