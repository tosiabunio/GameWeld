import type { SearchResults } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('quick open search', () => {
  let t: TestContext;
  let director: string;
  let projectId: string;

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    t.app.inject({
      method,
      url: `/api/projects/${projectId}${url}`,
      headers: { cookie: director },
      ...(payload ? { payload } : {}),
    });
  const search = async (q: string): Promise<SearchResults> =>
    (await call('GET', `/search?q=${encodeURIComponent(q)}`)).json();

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    projectId = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: director },
        payload: { name: 'Searched' },
      })
    ).json().id;
    const item = (await call('POST', '/backlog', { title: 'Boss fight', category: 'must' })).json();
    await call('PATCH', `/backlog/${item.id}`, {
      version: item.version,
      description: 'The arena closes behind the player.',
    });
    await call('POST', `/backlog/${item.id}/tasks`, { title: 'Arena gate', category: 'code' });
    await call('POST', `/backlog/${item.id}/tasks`, {
      title: '100% done_marker',
      category: 'code',
    });
    const gone = (
      await call('POST', `/backlog/${item.id}/tasks`, { title: 'Arena lights', category: 'assets' })
    ).json();
    await call('PATCH', `/tasks/${gone.id}`, { version: gone.version, archived: true });
  });
  afterAll(async () => {
    await t.close();
  });

  it('finds items and tasks by title or description, in any letter case, without deleted work', async () => {
    const found = await search('ARENA');
    expect(found.tasks.map((task) => task.title)).toEqual(['Arena gate']);
    expect(found.tasks[0]).toMatchObject({ itemTitle: 'Boss fight', completed: false });
    // The item matches by its description.
    expect(found.items.map((i) => i.title)).toEqual(['Boss fight']);
    expect(await search('   ')).toEqual({ items: [], tasks: [] });
  });

  it('takes % and _ as letters to look for', async () => {
    expect((await search('%')).tasks.map((task) => task.title)).toEqual(['100% done_marker']);
    expect((await search('e_m')).tasks.map((task) => task.title)).toEqual(['100% done_marker']);
    expect((await search('d_ne')).tasks).toEqual([]);
  });
});
