import type { BacklogItem } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

/** What the Backlog's long lanes stand on: when items were accepted, and parts of the Backlog. */
describe('backlog by state and time of acceptance', () => {
  let t: TestContext;
  let director: string;
  let projectId: string;

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    projectId = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: director },
        payload: { name: 'Long lanes' },
      })
    ).json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  const base = () => `/api/projects/${projectId}/backlog`;
  const post = (url: string, payload: object = {}) =>
    t.app.inject({ method: 'POST', url, headers: { cookie: director }, payload });
  const list = async (query = ''): Promise<BacklogItem[]> => {
    const res = await t.app.inject({
      method: 'GET',
      url: `${base()}${query}`,
      headers: { cookie: director },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  };

  /** An item accepted as Done, with its acceptance moved back to a given time. */
  async function doneItem(title: string, acceptedAt: string): Promise<string> {
    const item = (await post(base(), { title, category: 'must' })).json<BacklogItem>();
    const task = (
      await post(`${base()}/${item.id}/tasks`, { category: 'code', title: 'Work' })
    ).json();
    await post(`/api/projects/${projectId}/tasks/${task.id}/complete`);
    expect((await post(`${base()}/${item.id}/accept`)).statusCode).toBe(200);
    await t.db.query('UPDATE acceptances SET accepted_at = $2 WHERE item_id = $1', [
      item.id,
      acceptedAt,
    ]);
    return item.id;
  }

  it('gives each Done item the time of its current acceptance, and no other item one', async () => {
    const august = await doneItem('August item', '2026-08-14T10:00:00Z');
    await doneItem('September item', '2026-09-03T09:30:00Z');
    await post(base(), { title: 'Still open', category: 'should' });
    const items = await list();
    expect(items.find((i) => i.id === august)?.acceptedAt).toBe('2026-08-14T10:00:00.000Z');
    expect(items.find((i) => i.title === 'Still open')?.acceptedAt).toBeNull();

    // Reopened, the item is no longer Done and has no time of acceptance; its history keeps it.
    const tasks = await t.app.inject({
      method: 'GET',
      url: `${base()}/${august}/tasks`,
      headers: { cookie: director },
    });
    await post(`/api/projects/${projectId}/tasks/${tasks.json()[0].id}/reopen`);
    const reopened = (await list()).find((i) => i.id === august)!;
    expect(reopened.state).toBe('open');
    expect(reopened.acceptedAt).toBeNull();
  });

  it('lists only the states asked for, and Done items by when they were accepted', async () => {
    await doneItem('Early September', '2026-09-01T00:00:00Z');
    const titles = (items: BacklogItem[]) => items.map((i) => i.title).sort();

    expect(titles(await list('?state=open'))).toEqual(['August item', 'Still open']);
    expect(titles(await list('?state=done'))).toEqual(['Early September', 'September item']);
    expect(titles(await list('?state=open,done'))).toHaveLength(4);
    // A date is its start in UTC; since is inclusive, before is not.
    expect(titles(await list('?acceptedSince=2026-09-01'))).toEqual([
      'Early September',
      'September item',
    ]);
    expect(titles(await list('?acceptedSince=2026-09-02'))).toEqual(['September item']);
    expect(titles(await list('?acceptedBefore=2026-09-03T09:30:00Z'))).toEqual(['Early September']);
    expect(
      titles(await list('?state=done&acceptedSince=2026-09-01&acceptedBefore=2026-09-02')),
    ).toEqual(['Early September']);
    // Items that are not Done have no time of acceptance to match.
    expect(await list('?state=open&acceptedSince=2026-01-01')).toEqual([]);

    for (const bad of ['?state=closed', '?state=open,', '?acceptedSince=yesterday']) {
      const res = await t.app.inject({
        method: 'GET',
        url: `${base()}${bad}`,
        headers: { cookie: director },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('lists an item once when archived Workboards kept it in their scope', async () => {
    // A project of its own, so the scope limit leaves room.
    const own = (await post('/api/projects', { name: 'Carried over' })).json<{ id: string }>().id;
    const url = `/api/projects/${own}`;
    const item = (await post(`${url}/backlog`, { title: 'Carried over', category: 'must' })).json();
    for (const name of ['Sprint A', 'Sprint B']) {
      const board = (await post(`${url}/boards`, { name })).json();
      expect((await post(`${url}/boards/${board.id}/scope`, { itemId: item.id })).statusCode).toBe(
        201,
      );
      if (name === 'Sprint A') {
        const archived = await post(`${url}/boards/${board.id}/archive`, {
          returnUnfinished: true,
        });
        expect(archived.statusCode).toBe(200);
      }
    }
    const res = await t.app.inject({
      method: 'GET',
      url: `${url}/backlog`,
      headers: { cookie: director },
    });
    const rows = res.json<BacklogItem[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.activeBoard?.name).toBe('Sprint B');
  });
});
