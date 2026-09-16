import type { FastifyInstance } from 'fastify';
import { buildApp, createContext } from '../src/app.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { createPool, type Db } from '../src/db.ts';
import { seedDemo } from '../src/seed.ts';

export function testConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): Config {
  return loadConfig({
    APP_ENV: 'test',
    AUTH_MOCK: 'true',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    ATTACHMENTS_DIR: 'test-results/attachments',
    ...overrides,
  });
}

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}

/** Builds an app against the shared test database, seeding demo data if the database is empty. */
export async function startApp(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<TestContext> {
  const config = testConfig(overrides);
  const db = createPool(config.databaseUrl);
  await seedDemo(db);
  const app = await buildApp(createContext(config, db));
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.end();
    },
  };
}

/** Signs in through the mock provider and returns the cookie header for later requests. */
export async function signInAs(app: FastifyInstance, persona: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/mock/sign-in',
    payload: { persona },
  });
  if (res.statusCode !== 204)
    throw new Error(`sign-in as ${persona} failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'gw_session');
  if (!cookie) throw new Error('no session cookie set');
  return `${cookie.name}=${cookie.value}`;
}
