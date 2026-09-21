import { buildApp, createContext } from './app.ts';
import { loadConfig } from './config.ts';
import { createPool } from './db.ts';
import { migrate, resetDatabase } from './migrate.ts';
import { seedDemo } from './seed.ts';

const config = loadConfig();
const db = createPool(config.databaseUrl);

if (config.resetDatabase) {
  await resetDatabase(db);
  console.log('database reset');
}
const migration = await migrate(db, console.log);
console.log(`schema version: ${migration.current ?? 'none'}`);

if (config.seedDemo) {
  const seeded = await seedDemo(db);
  console.log(seeded ? 'demo data seeded' : 'database not empty, seed skipped');
}

const app = await buildApp(createContext(config, db));
await app.listen({ port: config.port, host: config.host });
console.log(`GameWeld API listening on http://${config.host}:${config.port} (${config.appEnv})`);
// The one value an administrator must copy into the provider's console, printed where they look.
for (const provider of config.oidcProviders) {
  console.log(
    `${provider.label} sign-in enabled; authorized redirect URI: ${provider.redirectUri}`,
  );
}
if (config.initialAdminEmail) console.log(`initial admin: ${config.initialAdminEmail}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
