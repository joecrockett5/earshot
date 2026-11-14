import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/server', 'apps/web'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['packages/shared/src/**', 'apps/server/src/**'],
      exclude: ['**/*.test.ts', '**/test-helpers.ts', 'apps/server/src/index.ts'],
    },
  },
});
