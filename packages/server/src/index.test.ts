import { expect, it } from 'vitest';
import { LINKED_CORE_PACKAGE_ID, SERVER_PACKAGE_ID } from './index.ts';

it('links the server to core', () => {
  expect(SERVER_PACKAGE_ID).toBe('@gaveta/server');
  expect(LINKED_CORE_PACKAGE_ID).toBe('@gaveta/core');
});
