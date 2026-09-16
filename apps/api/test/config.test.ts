import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const base = { DATABASE_URL: 'postgres://x:y@localhost:5432/z' };

describe('configuration guard (T1)', () => {
  it('allows mock sign-in and seeding outside production', () => {
    expect(
      loadConfig({ ...base, APP_ENV: 'local', AUTH_MOCK: 'true', SEED_DEMO: 'true' }).authMock,
    ).toBe(true);
    expect(loadConfig({ ...base, APP_ENV: 'test', AUTH_MOCK: 'true' }).authMock).toBe(true);
  });

  it('refuses to start a production configuration with any development convenience enabled', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production', AUTH_MOCK: 'true' })).toThrow(
      /AUTH_MOCK/,
    );
    expect(() => loadConfig({ ...base, APP_ENV: 'production', SEED_DEMO: 'true' })).toThrow(
      /SEED_DEMO/,
    );
    expect(() => loadConfig({ ...base, APP_ENV: 'production', RESET_DATABASE: 'true' })).toThrow(
      /RESET_DATABASE/,
    );
    expect(loadConfig({ ...base, APP_ENV: 'production' }).authMock).toBe(false);
  });

  it('rejects a missing database URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
