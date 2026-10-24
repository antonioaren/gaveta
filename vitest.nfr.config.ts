import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 300_000,
    setupFiles: ['apps/web/src/test-setup.ts'],
    include: ['packages/server/src/live-pipeline.perf.test.ts'],
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
  },
});
