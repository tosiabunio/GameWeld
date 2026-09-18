import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createPool } from '../src/db.ts';

it('gives each existing task its newest previewable image as the cover', async () => {
  const db = createPool(process.env.TEST_DATABASE_URL!);
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    // The old schema and fixture are isolated from the other integration tests.
    await tx.query('CREATE SCHEMA task_covers_migration_test');
    await tx.query('SET LOCAL search_path TO task_covers_migration_test, public');
    for (const name of ['0001_mvp_schema', '0002_comment_kind', '0003_board_lifecycle']) {
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
    const task = async () =>
      (
        await tx.query(
          "INSERT INTO tasks (project_id, item_id, title, category) VALUES ($1, $2, 'Old task', 'code') RETURNING id",
          [project, item],
        )
      ).rows[0].id as string;
    const [withImages, withoutImages, onlySvg] = [await task(), await task(), await task()];
    const attach = async (taskId: string | null, type: string, minutesAgo: number) =>
      (
        await tx.query(
          `INSERT INTO attachments (project_id, item_id, task_id, uploaded_by, file_name, content_type, size_bytes, storage_key, created_at)
           VALUES ($1, $2, $3, $4, 'file', $5, 0, gen_random_uuid()::text, now() - make_interval(mins => $6)) RETURNING id`,
          [project, taskId ? null : item, taskId, user, type, minutesAgo],
        )
      ).rows[0].id as string;
    await attach(withImages, 'image/png', 30);
    const newest = await attach(withImages, 'image/jpeg', 20);
    await attach(withImages, 'application/pdf', 10);
    await attach(withImages, 'image/svg+xml', 5);
    await attach(withoutImages, 'text/plain', 5);
    await attach(onlySvg, 'image/svg+xml', 5);
    await attach(null, 'image/png', 1); // an item image never becomes a task's cover

    await tx.query(
      await readFile(new URL('../migrations/0004_task_covers.sql', import.meta.url), 'utf8'),
    );
    const covers = Object.fromEntries(
      (await tx.query('SELECT id, cover_attachment_id, version FROM tasks')).rows.map((r) => [
        r.id,
        r,
      ]),
    );
    expect(covers[withImages].cover_attachment_id).toBe(newest);
    expect(covers[withImages].version).toBe(2);
    expect(covers[withoutImages].cover_attachment_id).toBeNull();
    expect(covers[withoutImages].version).toBe(1);
    expect(covers[onlySvg].cover_attachment_id).toBeNull();
  } finally {
    await tx.query('ROLLBACK');
    tx.release();
    await db.end();
  }
});
