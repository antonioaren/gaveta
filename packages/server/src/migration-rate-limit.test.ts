import { GavetaError } from '@gaveta/core';
import { expect, it } from 'vitest';
import { assertMigrationRateLimit, resetMigrationRateLimitForTests } from './migration-rate-limit.ts';

it('limits migration requests per bucket key', () => {
  resetMigrationRateLimitForTests();
  for (let index = 0; index < 40; index += 1) {
    assertMigrationRateLimit('test');
  }
  expect(() => assertMigrationRateLimit('test')).toThrow(GavetaError);
});
