import { readFile } from 'node:fs/promises';
import { generateKeyBetween } from 'fractional-indexing';
import { expect, it } from 'vitest';
import { createPool } from '../src/db.ts';

it('repairs what earlier versions left stranded, and only that', async () => {
  const db = createPool(process.env.TEST_DATABASE_URL!);
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    // The old schema and fixture are isolated from the other integration tests.
    await tx.query('CREATE SCHEMA nothing_stranded_migration_test');
    await tx.query('SET LOCAL search_path TO nothing_stranded_migration_test, public');
    for (const name of [
      '0001_mvp_schema',
      '0002_comment_kind',
      '0003_board_lifecycle',
      '0004_task_covers',
      '0005_user_avatars',
      '0006_accepted_items_leave_boards',
      '0007_my_task_ranks',
    ]) {
      await tx.query(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
    }
    const one = async (sql: string, params: unknown[] = []) =>
      (await tx.query(sql, params)).rows[0].id as string;
    const member = await one("INSERT INTO users (display_name) VALUES ('Member') RETURNING id");
    const gone = await one("INSERT INTO users (display_name) VALUES ('Gone') RETURNING id");
    const project = await one("INSERT INTO projects (name) VALUES ('Old project') RETURNING id");
    await tx.query(
      "INSERT INTO project_memberships (project_id, user_id, roles) VALUES ($1, $2, '{developer}')",
      [project, member],
    );
    const board = await one(
      "INSERT INTO workboards (project_id, name) VALUES ($1, 'Sprint') RETURNING id",
      [project],
    );
    const column = async (kind: string, rank: string) =>
      one(
        'INSERT INTO board_columns (board_id, name, kind, rank) VALUES ($1, $2, $3::column_kind, $4) RETURNING id',
        [board, kind, kind, rank],
      );
    const todoCode = await column('todo_code', 'a0');
    await column('todo_assets', 'a1');
    await column('todo_content', 'a2');
    const doneColumn = await column('done', 'a3');
    const item = async (title: string, archived = false) =>
      one(
        `INSERT INTO backlog_items (project_id, title, category, rank, archived_at)
         VALUES ($1, $2, 'must', 'a0', CASE WHEN $3 THEN now() END) RETURNING id`,
        [project, title, archived],
      );
    const task = async (
      itemId: string,
      title: string,
      is: { completed?: boolean; assigneeId?: string } = {},
    ) =>
      one(
        `INSERT INTO tasks (project_id, item_id, title, category, completed, completed_at, assignee_id)
         VALUES ($1, $2, $3, 'code', $4, CASE WHEN $4 THEN now() END, $5) RETURNING id`,
        [project, itemId, title, is.completed ?? false, is.assigneeId ?? null],
      );
    const place = (taskId: string, columnId: string, rank: string) =>
      tx.query(
        'INSERT INTO task_placements (task_id, board_id, column_id, rank) VALUES ($1, $2, $3, $4)',
        [taskId, board, columnId, rank],
      );
    const scope = (itemId: string) =>
      tx.query('INSERT INTO workboard_scope (board_id, item_id) VALUES ($1, $2)', [board, itemId]);
    const request = (taskId: string) =>
      one(
        'INSERT INTO work_requests (task_id, board_id, requester_id) VALUES ($1, $2, $3) RETURNING id',
        [taskId, board, member],
      );

    const inScope = await item('In scope');
    await scope(inScope);
    const alreadyPlaced = await task(inScope, 'Already placed');
    await place(alreadyPlaced, todoCode, 'a0');
    const strandedOld = await task(inScope, 'Stranded, older');
    const strandedNew = await task(inScope, 'Stranded, newer');
    await tx.query("UPDATE tasks SET created_at = now() - interval '1 hour' WHERE id = $1", [
      strandedOld,
    ]);
    const finished = await task(inScope, 'Finished unplaced', { completed: true });
    const askedAndStranded = await request(strandedNew);

    const outside = await item('Outside');
    const waiting = await task(outside, 'Rightly waiting');
    const stillPending = await request(waiting);
    const finishedAsked = await task(outside, 'Finished, asked for', { completed: true });
    const pointless = await request(finishedAsked);
    const theirs = await task(outside, 'Of someone gone', { assigneeId: gone });
    const ours = await task(outside, 'Of a member', { assigneeId: member });

    const archived = await item('Archived in scope', true);
    await scope(archived);
    const archivedCard = await task(archived, 'Card of an archived item', { completed: true });
    await place(archivedCard, doneColumn, 'a0');

    await tx.query(
      await readFile(new URL('../migrations/0008_nothing_stranded.sql', import.meta.url), 'utf8'),
    );

    const placements = (
      await tx.query(
        `SELECT task_id, column_id, rank COLLATE "C" AS rank FROM task_placements
          WHERE is_current ORDER BY rank COLLATE "C"`,
      )
    ).rows;
    // The stranded tasks joined the end of their To Do column, older first; nothing else moved.
    expect(placements.map((p) => p.task_id)).toEqual([alreadyPlaced, strandedOld, strandedNew]);
    expect(placements.every((p) => p.column_id === todoCode)).toBe(true);
    // The repaired ranks are keys the application can go on ordering between and after.
    for (const [i, p] of placements.entries()) {
      const next = placements[i + 1]?.rank ?? null;
      expect(() => generateKeyBetween(p.rank, next)).not.toThrow();
    }
    expect(placements.some((p) => p.task_id === finished)).toBe(false);

    const status = async (id: string) =>
      (await tx.query('SELECT status, decision_note FROM work_requests WHERE id = $1', [id]))
        .rows[0];
    expect(await status(askedAndStranded)).toEqual({
      status: 'approved',
      decision_note: 'Task already on the Workboard',
    });
    expect(await status(pointless)).toEqual({
      status: 'rejected',
      decision_note: 'Task completed',
    });
    expect((await status(stillPending)).status).toBe('pending');

    expect(
      (await tx.query('SELECT 1 FROM workboard_scope WHERE item_id = $1', [archived])).rowCount,
    ).toBe(0);
    expect(
      (await tx.query('SELECT 1 FROM workboard_scope WHERE item_id = $1', [inScope])).rowCount,
    ).toBe(1);
    expect(
      (
        await tx.query(
          'SELECT removed_reason FROM task_placements WHERE task_id = $1 AND NOT is_current',
          [archivedCard],
        )
      ).rows[0],
    ).toEqual({ removed_reason: 'item archived' });

    const assignee = async (id: string) =>
      (await tx.query('SELECT assignee_id FROM tasks WHERE id = $1', [id])).rows[0].assignee_id;
    expect(await assignee(theirs)).toBeNull();
    expect(await assignee(ours)).toBe(member);

    // Every repair is on record; running it again finds nothing left to do.
    const before = (await tx.query('SELECT count(*) AS n FROM activity')).rows[0].n;
    expect(Number(before)).toBe(6);
    await tx.query(
      await readFile(new URL('../migrations/0008_nothing_stranded.sql', import.meta.url), 'utf8'),
    );
    expect((await tx.query('SELECT count(*) AS n FROM activity')).rows[0].n).toBe(before);
  } finally {
    await tx.query('ROLLBACK');
    tx.release();
    await db.end();
  }
});
