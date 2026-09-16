import { createPool } from '../src/db.ts';
import { migrate, resetDatabase } from '../src/migrate.ts';

/** Resets the throwaway test database and applies migrations once before the api test files run. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for api integration tests');
  const db = createPool(url);
  await resetDatabase(db);
  await migrate(db);
  await db.end();
}
