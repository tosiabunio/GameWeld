import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createPool } from '../src/db.ts';

it('upgrades an existing board history and repairs stranded tasks, requests, and SVG covers', async () => {
  const db = createPool(process.env.TEST_DATABASE_URL!);
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    // The old schema and fixture are isolated from the other integration tests.
    await tx.query('CREATE SCHEMA lifecycle_migration_test');
    await tx.query('SET LOCAL search_path TO lifecycle_migration_test, public');
    for (const name of ['0001_mvp_schema', '0002_comment_kind']) {
      await tx.query(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
    const user = (
      await tx.query("INSERT INTO users (display_name) VALUES ('Migrated user') RETURNING id")
    ).rows[0].id;
    const project = (
      await tx.query("INSERT INTO projects (name) VALUES ('Old project') RETURNING id")
    ).rows[0].id;
    const item = (
      await tx.query(
        "INSERT INTO backlog_items (project_id, title, category, rank) VALUES ($1, 'Old item', 'must', 'a0') RETURNING id",
        [project],
      )
    ).rows[0].id;
    const archived = (
      await tx.query(
        "INSERT INTO workboards (project_id, name, state, archived_at) VALUES ($1, 'Old board', 'archived', now()) RETURNING id",
        [project],
      )
    ).rows[0].id;
    const active = (
      await tx.query(
        "INSERT INTO workboards (project_id, name) VALUES ($1, 'Current board') RETURNING id",
        [project],
      )
    ).rows[0].id;
    for (const board of [archived, active]) {
      await tx.query(
        "INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, 'Code', 'todo_code', 'a0')",
        [board],
      );
    }
    const tasks: string[] = [];
    for (const [board, completed] of [
      [archived, false],
      [archived, true],
      [active, false],
    ] as const) {
      const task = (
        await tx.query(
          `INSERT INTO tasks (project_id, item_id, title, category, completed, completed_at)
         VALUES ($1, $2, 'Old task', 'code', $3, CASE WHEN $3 THEN now() END) RETURNING id`,
          [project, item, completed],
        )
      ).rows[0].id;
      tasks.push(task);
      await tx.query(
        `INSERT INTO task_placements (task_id, board_id, column_id, rank)
         SELECT $1, $2, id, 'a0' FROM board_columns WHERE board_id = $2`,
        [task, board],
      );
      await tx.query(
        'INSERT INTO work_requests (task_id, board_id, requester_id) VALUES ($1, $2, $3)',
        [task, board, user],
      );
    }
    const svg = (
      await tx.query(
        `INSERT INTO attachments (project_id, item_id, uploaded_by, file_name, content_type, size_bytes, storage_key)
       VALUES ($1, $2, $3, 'old.svg', 'image/svg+xml', 0, 'old-cover') RETURNING id`,
        [project, item, user],
      )
    ).rows[0].id;
    await tx.query('UPDATE backlog_items SET cover_attachment_id = $2 WHERE id = $1', [item, svg]);
    await tx.query(
      await readFile(new URL('../migrations/0003_board_lifecycle.sql', import.meta.url), 'utf8'),
    );

    for (const [index, task] of tasks.entries()) {
      const placement = (await tx.query('SELECT * FROM task_placements WHERE task_id = $1', [task]))
        .rows[0];
      expect(placement.is_current).toBe(index !== 0);
      if (index === 0) {
        expect(placement.last_column_id).toBe(placement.column_id);
        expect(placement.removed_reason).toBe('released from archived board');
      }
      const request = (await tx.query('SELECT * FROM work_requests WHERE task_id = $1', [task]))
        .rows[0];
      expect(request.status).toBe(index === 2 ? 'pending' : 'rejected');
      if (index !== 2) {
        expect(request.decision_note).toBe('Workboard archived');
        expect(request.decided_at).not.toBeNull();
      }
    }
    expect(
      (await tx.query('SELECT cover_attachment_id FROM backlog_items WHERE id = $1', [item]))
        .rows[0].cover_attachment_id,
    ).toBeNull();
    expect((await tx.query('SELECT 1 FROM attachments WHERE id = $1', [svg])).rowCount).toBe(1);
    expect(
      (await tx.query('SELECT action FROM activity ORDER BY action')).rows.map((r) => r.action),
    ).toEqual(['request.rejected', 'request.rejected', 'task.returned']);
    expect(
      (await tx.query('SELECT deleted_at FROM board_columns')).rows.every(
        (r) => r.deleted_at === null,
      ),
    ).toBe(true);
  } finally {
    await tx.query('ROLLBACK');
    tx.release();
    await db.end();
  }
});
