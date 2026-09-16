import { z } from 'zod';

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']).default('local'),
  AUTH_MOCK: z.enum(['true', 'false']).default('false'),
  SEED_DEMO: z.enum(['true', 'false']).default('false'),
  RESET_DATABASE: z.enum(['true', 'false']).default('false'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  WEB_DIST: z.string().optional(),
  ATTACHMENTS_DIR: z.string().default('./data/attachments'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .positive()
    .default(24 * 14),
});

export interface Config {
  appEnv: 'local' | 'test' | 'production';
  authMock: boolean;
  seedDemo: boolean;
  resetDatabase: boolean;
  databaseUrl: string;
  port: number;
  host: string;
  webDist: string | undefined;
  attachmentsDir: string;
  sessionTtlMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  const config: Config = {
    appEnv: e.APP_ENV,
    authMock: e.AUTH_MOCK === 'true',
    seedDemo: e.SEED_DEMO === 'true',
    resetDatabase: e.RESET_DATABASE === 'true',
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    host: e.HOST,
    webDist: e.WEB_DIST,
    attachmentsDir: e.ATTACHMENTS_DIR,
    sessionTtlMs: e.SESSION_TTL_HOURS * 60 * 60 * 1000,
  };
  assertSafe(config);
  return config;
}

/**
 * T1 guard: the mock provider, demo seed, and database reset are development conveniences.
 * A production configuration that enables any of them is refused at startup rather than served.
 */
export function assertSafe(config: Config): void {
  if (config.appEnv !== 'production') return;
  const offenders = [
    config.authMock && 'AUTH_MOCK',
    config.seedDemo && 'SEED_DEMO',
    config.resetDatabase && 'RESET_DATABASE',
  ].filter(Boolean);
  if (offenders.length > 0) {
    throw new Error(
      `Refusing to start: ${offenders.join(', ')} must not be enabled when APP_ENV=production`,
    );
  }
}
