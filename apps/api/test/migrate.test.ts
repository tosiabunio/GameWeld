import { describe, expect, it } from 'vitest';
import { createPool } from '../src/db.ts';
import { currentVersion, migrate } from '../src/migrate.ts';

describe('migration runner', () => {
  it('is idempotent and reports the current version', async () => {
    const db = createPool(process.env.TEST_DATABASE_URL!);
    try {
      const again = await migrate(db);
      expect(again.applied).toEqual([]);
      expect(again.current).toBe('0009_notifications');
      expect(await currentVersion(db)).toBe('0009_notifications');
    } finally {
      await db.end();
    }
  });
});
