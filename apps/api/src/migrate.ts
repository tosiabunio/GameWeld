import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.ts';
import { createPool, withTransaction } from './db.ts';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export interface MigrationResult {
  applied: string[];
  current: string | null;
}

/**
 * Applies every `NNNN_name.sql` file in apps/api/migrations that is not yet recorded in
 * schema_migrations, in file-name order, each in its own transaction. Runs on every start.
 */
export async function migrate(
  db: Db,
  log: (msg: string) => void = () => undefined,
): Promise<MigrationResult> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = (await readdir(migrationsDir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const done = new Set(
    (await db.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map(
      (r) => r.version,
    ),
  );

  const applied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (done.has(version)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    await withTransaction(db, async (tx) => {
      // Serialize concurrent starters (for example two app replicas) on one advisory lock.
      await tx.query('SELECT pg_advisory_xact_lock(727000)');
      const again = await tx.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (again.rowCount) return;
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    });
    applied.push(version);
    log(`migration applied: ${version}`);
  }

  const current = await currentVersion(db);
  return { applied, current };
}

export async function currentVersion(db: Db): Promise<string | null> {
  const res = await db.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
  );
  return res.rows[0]?.version ?? null;
}

/** Drops everything in the public schema. Only reachable when RESET_DATABASE=true outside production. */
export async function resetDatabase(db: Db): Promise<void> {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const db = createPool(url);
  const result = await migrate(db, console.log);
  console.log(`schema version: ${result.current ?? 'none'} (${result.applied.length} applied now)`);
  await db.end();
}
