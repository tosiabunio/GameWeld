import type { BacklogItem, Label, Task, TaskDetail } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

/** A small Trello export: two open lists, one archived; cards with all the things a card has. */
const trello = {
  name: 'Indie board',
  lists: [
    { id: 'l1', name: 'Combat', closed: false },
    { id: 'l2', name: 'Menus', closed: false },
    { id: 'l3', name: 'Old ideas', closed: true },
  ],
  labels: [
    { id: 'lab1', name: 'Bug', color: 'red' },
    { id: 'lab2', name: 'Art', color: 'sky_dark' },
    { id: 'lab3', name: '', color: 'purple' },
  ],
  cards: [
    {
      id: 'c2',
      idList: 'l1',
      name: 'Dodge roll',
      desc: 'With **i-frames**.',
      pos: 200,
      idLabels: ['lab1', 'lab3'],
      due: '2026-10-05T12:00:00.000Z',
      dueComplete: false,
      shortUrl: 'https://trello.com/c/abc',
      attachments: [
        { url: 'https://example.com/ref.png', name: 'Reference' },
        { url: 'trello-internal', name: 'x' },
      ],
    },
    {
      id: 'c1',
      idList: 'l1',
      name: 'Sword swing',
      pos: 100,
      idLabels: ['lab2'],
      dueComplete: true,
      due: '2026-09-01T00:00:00.000Z',
    },
    { id: 'c3', idList: 'l2', name: 'Pause menu', pos: 50 },
    { id: 'c4', idList: 'l2', name: 'Archived card', closed: true },
    { id: 'c5', idList: 'l3', name: 'In an archived list' },
  ],
  checklists: [
    {
      id: 'k1',
      idCard: 'c2',
      name: 'Steps',
      checkItems: [
        { name: 'Animation', state: 'complete', pos: 2 },
        { name: 'Input buffer', state: 'incomplete', pos: 1 },
      ],
    },
  ],
  actions: [
    {
      type: 'commentCard',
      date: '2026-08-01T10:00:00.000Z',
      data: { text: 'Feels floaty.', card: { id: 'c2' } },
      memberCreator: { fullName: 'Ola' },
    },
    { type: 'updateCard', data: { card: { id: 'c2' } } },
  ],
};

describe('export, and import from Trello', () => {
  let t: TestContext;
  let director: string;
  let developer: string;

  const newProject = async (name: string) => {
    const id = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: director },
        payload: { name },
      })
    ).json().id as string;
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${id}/members`,
      headers: { cookie: director },
      payload: { email: 'developer@gameweld.local', roles: ['developer'] },
    });
    return id;
  };
  const get = (projectId: string, url: string, cookie = director) =>
    t.app.inject({ method: 'GET', url: `/api/projects/${projectId}${url}`, headers: { cookie } });
  const importTrello = (projectId: string, payload: object, cookie = director) =>
    t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/import/trello`,
      headers: { cookie },
      payload,
    });

  beforeAll(async () => {
    t = await startApp();
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
  });
  afterAll(async () => {
    await t.close();
  });

  it('brings Trello cards in as tasks under one backlog item per list', async () => {
    const projectId = await newProject('From Trello, as tasks');
    const res = await importTrello(projectId, {
      mode: 'cards_as_tasks',
      category: 'content',
      board: trello,
    });
    expect(res.statusCode, res.body).toBe(201);
    // Two links on Dodge roll: its reference and the card itself. An address that is not one is left out.
    expect(res.json()).toEqual({
      items: 2,
      tasks: 3,
      labels: 3,
      checklistItems: 2,
      comments: 1,
      links: 2,
    });

    const items: BacklogItem[] = (await get(projectId, '/backlog')).json();
    expect(items.map((i) => i.title)).toEqual(['Combat', 'Menus']);
    const tasks: Task[] = (await get(projectId, `/backlog/${items[0]!.id}/tasks`)).json();
    // In Trello's order within the list, not the file's.
    expect(tasks.map((task) => task.title)).toEqual(['Sword swing', 'Dodge roll']);
    const [swing, dodge] = tasks as [Task, Task];
    // A label that names a kind of work decides the category; otherwise the one that was asked for.
    expect(swing).toMatchObject({
      category: 'assets',
      completed: true,
      dueDate: '2026-09-01',
      placement: null,
    });
    expect(dodge).toMatchObject({
      category: 'content',
      completed: false,
      dueDate: '2026-10-05',
      checklist: { total: 2, done: 1 },
    });
    expect(dodge.labels.map((l: Label) => [l.name, l.color])).toEqual([
      ['Bug', 'red'],
      ['purple', 'purple'],
    ]);

    const detail: TaskDetail = (await get(projectId, `/tasks/${dodge.id}`)).json();
    expect(detail.description).toBe('With **i-frames**.');
    expect(detail.checklistItems.map((i) => [i.title, i.done])).toEqual([
      ['Input buffer', false],
      ['Animation', true],
    ]);
    expect(detail.comments[0]!.body).toContain('**Ola** on Trello, 2026-08-01');
    expect(detail.comments[0]!.body).toContain('Feels floaty.');
    expect(detail.links.map((l) => l.url)).toEqual([
      'https://example.com/ref.png',
      'https://trello.com/c/abc',
    ]);
    // The project's labels are reused on a second import, not doubled.
    const again = await importTrello(projectId, { mode: 'cards_as_tasks', board: trello });
    expect(again.json().labels).toBe(0);
  });

  it('or brings cards in as backlog items, their checklist entries as tasks', async () => {
    const projectId = await newProject('From Trello, as items');
    const res = await importTrello(projectId, {
      mode: 'cards_as_items',
      category: 'code',
      board: trello,
    });
    expect(res.json()).toMatchObject({ items: 3, tasks: 2, labels: 0, checklistItems: 0 });
    const items: BacklogItem[] = (await get(projectId, '/backlog')).json();
    expect(items.map((i) => i.title)).toEqual(['Pause menu', 'Sword swing', 'Dodge roll']);
    const dodge = items.find((i) => i.title === 'Dodge roll')!;
    expect(dodge.description).toContain('With **i-frames**.');
    expect(dodge.description).toContain(
      'From the Trello list “Combat”. Labels: Bug, purple. Due 2026-10-05.',
    );
    expect(dodge.taskCounts).toEqual({ total: 2, completed: 1 });
  });

  it('refuses what is not a Trello export, and anyone but a Director', async () => {
    const projectId = await newProject('Refusals');
    expect(
      (await importTrello(projectId, { mode: 'cards_as_tasks', board: { hello: 'world' } }))
        .statusCode,
    ).toBe(400);
    expect((await importTrello(projectId, { mode: 'sideways', board: trello })).statusCode).toBe(
      400,
    );
    expect(
      (await importTrello(projectId, { mode: 'cards_as_tasks', board: trello }, developer))
        .statusCode,
    ).toBe(403);
    expect((await get(projectId, '/export.json', developer)).statusCode).toBe(403);
    expect(((await get(projectId, '/backlog')).json() as BacklogItem[]).length).toBe(0);
  });

  it('exports the whole project as JSON and its tasks as CSV', async () => {
    const projectId = await newProject('Exported, "quoted"');
    await importTrello(projectId, {
      mode: 'cards_as_tasks',
      board: {
        ...trello,
        cards: [...trello.cards, { id: 'c6', idList: 'l2', name: '=HYPERLINK("x")', pos: 60 }],
      },
    });
    const json = await get(projectId, '/export.json');
    expect(json.statusCode).toBe(200);
    expect(json.headers['content-disposition']).toBe(
      'attachment; filename="gameweld-Exported-quoted.json"',
    );
    const data = json.json();
    expect(data).toMatchObject({
      format: 'gameweld-project',
      version: 1,
      project: { name: 'Exported, "quoted"' },
    });
    expect(data.members.map((m: { displayName: string }) => m.displayName)).toEqual([
      'Dana Director',
      'Devin Developer',
    ]);
    expect(data.labels.map((l: Label) => l.name)).toEqual(['Art', 'Bug', 'purple']);
    const combat = data.items.find((i: { title: string }) => i.title === 'Combat');
    const dodge = combat.tasks.find((task: { title: string }) => task.title === 'Dodge roll');
    expect(dodge).toMatchObject({
      labels: ['Bug', 'purple'],
      dueDate: '2026-10-05',
      checklist: [
        { title: 'Input buffer', done: false },
        { title: 'Animation', done: true },
      ],
    });
    expect(dodge.comments[0].authorName).toBe('Dana Director');
    expect(dodge.links).toHaveLength(2);
    expect(data.activity.map((a: { action: string }) => a.action)).toContain('project.imported');
    // Internal keys stay inside.
    expect(JSON.stringify(data)).not.toContain('task_id');

    const csv = await get(projectId, '/export/tasks.csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.body
      .replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe(
      'Item,Priority,Item state,Task,Category,Assignee,Status,Workboard,Column,Labels,Due,Blocked,Blocked reason,Checklist,Created,Completed',
    );
    expect(lines).toHaveLength(5);
    expect(lines.find((l) => l.includes('Dodge roll'))).toContain(
      'Combat,should,open,Dodge roll,code,,unplaced,,,"Bug, purple",2026-10-05,,,1/2,',
    );
    // A title that starts like a formula is text to a spreadsheet.
    expect(lines.find((l) => l.includes('HYPERLINK'))).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
