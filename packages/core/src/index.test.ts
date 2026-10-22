import { expect, it } from 'vitest';
import { CORE_PACKAGE_ID } from './index.ts';

it('identifies the core package', () => {
  expect(CORE_PACKAGE_ID).toBe('@gaveta/core');
});
