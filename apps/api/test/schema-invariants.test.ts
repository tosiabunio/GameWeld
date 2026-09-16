import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, type Db } from '../src/db.ts';
import { seedDemo } from '../src/seed.ts';

/** Invariants from implementation plan Section 4.2 that the schema itself enforces. */
describe('schema-level invariants', () => {
  let db: Db;
  let projectId: string;
  let boardId: string;
  let taskId: string;
  let columnId: string;

  beforeAll(async () => {
    db = createPool(process.env.TEST_DATABASE_URL!);
    await seedDemo(db);
    projectId = (
      await db.query<{ id: string }>(`SELECT id FROM projects WHERE name = 'Demo project'`)
    ).rows[0]!.id;
    boardId = (
      await db.query<{ id: string }>(`SELECT id FROM workboards WHERE project_id = $1`, [projectId])
    ).rows[0]!.id;
    taskId = (
      await db.query<{ id: string }>(`SELECT id FROM tasks WHERE project_id = $1 LIMIT 1`, [
        projectId,
      ])
    ).rows[0]!.id;
    columnId = (
      await db.query<{ id: string }>(
        `SELECT id FROM board_columns WHERE board_id = $1 AND kind = 'todo_code'`,
        [boardId],
      )
    ).rows[0]!.id;
  });
  afterAll(async () => {
    await db.end();
  });

  it('invariant 1: a task cannot exist without a parent backlog item', async () => {
    await expect(
      db.query(
        `INSERT INTO tasks (project_id, item_id, category, title) VALUES ($1, NULL, 'code', 'orphan')`,
        [projectId],
      ),
    ).rejects.toThrow(/null value in column "item_id"/);
  });

  it('invariant 2: a task has at most one current placement', async () => {
    await expect(
      db.query(
        `INSERT INTO task_placements (task_id, board_id, column_id, rank) VALUES ($1, $2, $3, 'a1')`,
        [taskId, boardId, columnId],
      ),
    ).rejects.toThrow(/task_placements_one_current/);
  });

  it('D1: only one active Workboard per project', async () => {
    await expect(
      db.query(`INSERT INTO workboards (project_id, name) VALUES ($1, 'Second active board')`, [
        projectId,
      ]),
    ).rejects.toThrow(/workboards_one_active_per_project/);
    // An archived second board is fine.
    await db.query(
      `INSERT INTO workboards (project_id, name, state, archived_at) VALUES ($1, 'Old board', 'archived', now())`,
      [projectId],
    );
  });

  it('invariant 10: exactly one Done column and one To Do column per category per board', async () => {
    await expect(
      db.query(
        `INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, 'Another Done', 'done', 'z')`,
        [boardId],
      ),
    ).rejects.toThrow(/board_columns_one_per_system_kind/);
    await expect(
      db.query(
        `INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, 'Another To Do', 'todo_code', 'z')`,
        [boardId],
      ),
    ).rejects.toThrow(/board_columns_one_per_system_kind/);
    // Any number of intermediate columns is allowed.
    await db.query(
      `INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, 'Blocked', 'intermediate', 'y')`,
      [boardId],
    );
  });

  it('R1: completed flag and completion timestamp must agree', async () => {
    await expect(
      db.query(`UPDATE tasks SET completed = true WHERE id = $1`, [taskId]),
    ).rejects.toThrow(/check constraint/);
  });

  it('one pending work request per task and board', async () => {
    const requester = (await db.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)).rows[0]!.id;
    await db.query(
      `INSERT INTO work_requests (task_id, board_id, requester_id) VALUES ($1, $2, $3)`,
      [taskId, boardId, requester],
    );
    await expect(
      db.query(`INSERT INTO work_requests (task_id, board_id, requester_id) VALUES ($1, $2, $3)`, [
        taskId,
        boardId,
        requester,
      ]),
    ).rejects.toThrow(/work_requests_one_pending/);
  });

  it('a membership must carry at least one role', async () => {
    const user = (await db.query<{ id: string }>(`SELECT id FROM users LIMIT 1`)).rows[0]!.id;
    await expect(
      db.query(
        `INSERT INTO project_memberships (project_id, user_id, roles) VALUES ($1, $2, '{}') ON CONFLICT DO NOTHING`,
        [projectId, user],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
