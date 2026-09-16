import { defineConfig } from '@playwright/test';
import path from 'node:path';

const port = 3100;
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://gameweld:gameweld@localhost:5433/gameweld_test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run start -w apps/api',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_ENV: 'test',
      AUTH_MOCK: 'true',
      SEED_DEMO: 'true',
      RESET_DATABASE: 'true',
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      // The API starts with apps/api as its working directory, so paths must be absolute.
      WEB_DIST: path.resolve(import.meta.dirname, 'apps/web/dist'),
      ATTACHMENTS_DIR: path.resolve(import.meta.dirname, 'test-results/attachments'),
    },
  },
});
