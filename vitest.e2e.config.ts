import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/00-req-nfr01-cli-iframe-latency.test.ts', 'e2e/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['e2e/global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
});
