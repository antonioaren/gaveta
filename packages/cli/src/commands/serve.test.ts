import { expect, it } from 'vitest';
import { serveCommand } from './serve.ts';

it('documents serve in the command registry', () => {
  expect(serveCommand.name).toBe('serve');
  expect(serveCommand.example).toContain('serve');
  expect(serveCommand.requiresVault).toBe(true);
});
