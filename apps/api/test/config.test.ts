import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const base = { DATABASE_URL: 'postgres://x:y@localhost:5432/z' };
const google = {
  PUBLIC_URL: 'https://gameweld.example.com',
  GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret',
};

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
    expect(loadConfig({ ...base, ...google, APP_ENV: 'production' }).authMock).toBe(false);
  });

  it('refuses to reset the database of an instance that may hold teams’ work', () => {
    // The demo beside teams runs outside production mode, where the guard above does not reach.
    expect(() =>
      loadConfig({
        ...base,
        ...google,
        APP_ENV: 'local',
        AUTH_MOCK: 'true',
        RESET_DATABASE: 'true',
      }),
    ).toThrow(/RESET_DATABASE.*sign-in provider/);
    expect(loadConfig({ ...base, APP_ENV: 'test', RESET_DATABASE: 'true' }).resetDatabase).toBe(
      true,
    );
  });

  it('limits visitors and the demo’s storage unless told otherwise', () => {
    expect(loadConfig(base)).toMatchObject({
      rateLimitPerMinute: 1200,
      demoStorageBytes: 1024 * 1024 * 1024,
    });
    expect(loadConfig({ ...base, RATE_LIMIT_PER_MINUTE: '0', DEMO_STORAGE_MB: '0' })).toMatchObject(
      { rateLimitPerMinute: null, demoStorageBytes: null },
    );
    // An empty value, as Compose passes an unset variable, is the default and not zero.
    expect(loadConfig({ ...base, RATE_LIMIT_PER_MINUTE: '', DEMO_STORAGE_MB: '' })).toMatchObject({
      rateLimitPerMinute: 1200,
      demoStorageBytes: 1024 * 1024 * 1024,
    });
    expect(() => loadConfig({ ...base, RATE_LIMIT_PER_MINUTE: '-5' })).toThrow(
      /RATE_LIMIT_PER_MINUTE/,
    );
  });

  it('refuses to start production with no sign-in provider, naming what to set', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production' })).toThrow(
      /no sign-in provider.*GOOGLE_CLIENT_ID/,
    );
  });

  it('rejects a missing database URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});

describe('Google sign-in configuration (T1)', () => {
  it('builds the redirect URI from PUBLIC_URL', () => {
    const config = loadConfig({ ...base, ...google, PUBLIC_URL: 'https://gameweld.example.com/' });
    expect(config.publicUrl).toBe('https://gameweld.example.com');
    expect(config.oidcProviders).toEqual([
      expect.objectContaining({
        id: 'google',
        issuer: 'https://accounts.google.com',
        redirectUri: 'https://gameweld.example.com/api/auth/google/callback',
      }),
    ]);
  });

  it('is off when neither Google setting is present, and refuses half of them', () => {
    expect(loadConfig(base).oidcProviders).toEqual([]);
    expect(() => loadConfig({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(/both/);
    expect(() => loadConfig({ ...base, GOOGLE_CLIENT_SECRET: 's' })).toThrow(/both/);
  });

  it('needs PUBLIC_URL, over HTTPS except on localhost outside production', () => {
    expect(() => loadConfig({ ...base, ...google, PUBLIC_URL: undefined })).toThrow(/PUBLIC_URL/);
    expect(() =>
      loadConfig({ ...base, ...google, PUBLIC_URL: 'http://gameweld.example.com' }),
    ).toThrow(/https/);
    expect(() =>
      loadConfig({ ...base, ...google, PUBLIC_URL: 'https://x.example.com/app' }),
    ).toThrow(/only the scheme and host/);
    expect(loadConfig({ ...base, ...google, PUBLIC_URL: 'http://localhost:8090' }).publicUrl).toBe(
      'http://localhost:8090',
    );
    expect(() =>
      loadConfig({
        ...base,
        ...google,
        APP_ENV: 'production',
        PUBLIC_URL: 'http://localhost:8090',
      }),
    ).toThrow(/https/);
  });

  it('treats empty values, as Compose passes unset variables, as unset', () => {
    const config = loadConfig({
      ...base,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      INITIAL_ADMIN_EMAIL: '',
      PUBLIC_URL: 'http://localhost:8090',
    });
    expect(config.oidcProviders).toEqual([]);
    expect(config.initialAdminEmail).toBeNull();
  });

  it('keeps the initial admin address lower-cased', () => {
    expect(
      loadConfig({ ...base, INITIAL_ADMIN_EMAIL: ' Boss@Example.com ' }).initialAdminEmail,
    ).toBe('boss@example.com');
  });

  it('still rejects a missing database URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
