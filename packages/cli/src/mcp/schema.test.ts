import { expect, it } from 'vitest';
import { newCommand } from '../commands/notes.ts';
import { importCommand } from '../commands/import.ts';
import { buildMcpInputSchema, optionCliFlag } from './schema.ts';

it('builds Zod fields from CLI options and positionals', () => {
  const schema = buildMcpInputSchema(newCommand, undefined);
  expect(schema.type).toBeDefined();
  expect(schema.allowCdn).toBeDefined();
  expect(schema.vault).toBeDefined();
  expect(schema.content).toBeDefined();
  expect(schema.titulo).toBeDefined();
});

it('maps import exclude to a string array field', () => {
  const schema = buildMcpInputSchema(importCommand, undefined);
  expect(schema.exclude).toBeDefined();
});

it('derives long CLI flags from option definitions', () => {
  const ifMatch = newCommand.options?.find((option) => option.name === 'ifMatch');
  expect(ifMatch).toBeDefined();
  if (ifMatch !== undefined) {
    expect(optionCliFlag(ifMatch)).toBe('--if-match');
  }
});
