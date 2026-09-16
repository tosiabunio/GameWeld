import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('demo seed and project list', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('seeds once and then skips', async () => {
    const { seedDemo } = await import('../src/seed.ts');
    expect(await seedDemo(t.db)).toBe(false);
    const users = await t.db.query('SELECT count(*)::int AS n FROM users');
    expect(users.rows[0].n).toBe(3);
  });

  it('lists the demo project for every persona with its own roles', async () => {
    for (const [persona, role] of [
      ['director', 'director'],
      ['developer', 'developer'],
      ['tester', 'tester'],
    ] as const) {
      const cookie = await signInAs(t.app, persona);
      const res = await t.app.inject({ method: 'GET', url: '/api/projects', headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const [project] = res.json();
      expect(project).toMatchObject({
        name: 'Demo project',
        roles: [role],
        scopeLimit: 3,
        doneRestricted: false,
      });
      expect(project.itemCount).toBeGreaterThanOrEqual(4);
    }
  });

  it('seeds the Section 17 worked example on an active board', async () => {
    const board = await t.db.query(
      `SELECT name, state FROM workboards WHERE name = 'September production'`,
    );
    expect(board.rows[0]).toMatchObject({ state: 'active' });
    const placed = await t.db.query(
      `SELECT t.title, c.kind FROM task_placements p
         JOIN tasks t ON t.id = p.task_id JOIN board_columns c ON c.id = p.column_id
        WHERE p.is_current ORDER BY c.kind`,
    );
    expect(placed.rows.map((r) => r.kind)).toEqual(['todo_code', 'todo_assets', 'todo_content']);
    const flying = await t.db.query(
      `SELECT count(*)::int AS n FROM task_placements p JOIN tasks t ON t.id = p.task_id
         JOIN backlog_items b ON b.id = t.item_id WHERE b.title = 'Flying enemy' AND p.is_current`,
    );
    expect(flying.rows[0].n).toBe(0);
  });
});
