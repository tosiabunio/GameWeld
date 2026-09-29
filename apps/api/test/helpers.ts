import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { buildApp, createContext, type AppContext } from '../src/app.ts';
import { createSession, SESSION_COOKIE } from '../src/auth.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { createPool, type Db } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
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
export async function startApp(
  overrides: Partial<NodeJS.ProcessEnv> = {},
  extras: Pick<AppContext, 'oidcFetch'> = {},
): Promise<TestContext> {
  const config = testConfig(overrides);
  const db = createPool(config.databaseUrl);
  await seedDemo(db);
  const app = await buildApp(createContext(config, db, extras));
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

/** A one-file multipart body, as the attachment upload routes expect. */
export function multipart(fileName: string, contentType: string, content: Buffer | string) {
  const boundary = '----gameweld-test-boundary';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body };
}

/**
 * Someone of a team, as if signed in with Google: an account and a session, without going through
 * the provider (google-sign-in.test.ts does that). Their projects are team projects, which the
 * personas cannot join.
 */
export async function signInAsTeamMember(
  t: Pick<TestContext, 'db'>,
  email: string,
  { admin = false } = {},
): Promise<{ id: string; cookie: string }> {
  const user = await t.db.query<{ id: string }>(
    'INSERT INTO users (display_name, email, is_admin) VALUES ($1, $2, $3) RETURNING id',
    [email.split('@')[0], email, admin],
  );
  const id = user.rows[0]!.id;
  await t.db.query(
    `INSERT INTO identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)`,
    [randomUUID(), id, email],
  );
  const session = await createSession(t.db, id, 60 * 60 * 1000);
  return { id, cookie: `${SESSION_COOKIE}=${session.token}` };
}

/**
 * A fresh, migrated database beside the shared one, for a test that must know everything in it
 * or would disturb the other test files; returns its URL for DATABASE_URL.
 */
export async function ownDatabase(name: string): Promise<string> {
  const shared = createPool(process.env.TEST_DATABASE_URL!);
  await shared.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await shared.query(`CREATE DATABASE ${name}`);
  await shared.end();
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.pathname = `/${name}`;
  const own = createPool(url.href);
  await migrate(own);
  await own.end();
  return url.href;
}
