import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/domain/vitest.config.ts',
      'apps/web/vitest.config.ts',
      'apps/api/vitest.config.ts',
    ],
  },
});
