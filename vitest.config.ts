import { defineConfig } from 'vitest/config';

const testGlobs = [
  'packages/*/src/**/*.test.ts',
  'apps/*/src/**/*.test.ts',
  'apps/*/src/**/*.test.tsx',
  'fixtures/src/**/*.test.ts',
  'tests/**/*.test.ts',
];

export default defineConfig({
  test: {
    setupFiles: ['tests/i18n-setup.ts', 'apps/web/src/test-setup.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['packages/core/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        lines: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: testGlobs,
          exclude: [
            'packages/server/src/live-pipeline.perf.test.ts',
            'packages/server/src/**/*.integration.test.ts',
          ],
          testTimeout: 20_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'server-integration',
          include: ['packages/server/src/**/*.integration.test.ts'],
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
