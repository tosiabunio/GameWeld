import { defineConfig } from 'vitest/config';

/** Unit tests for the client's plain logic; what needs a browser is in e2e/. */
export default defineConfig({
  test: {
    name: 'web',
    include: ['test/**/*.test.ts'],
  },
});
