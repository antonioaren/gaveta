import { EXIT_CODES } from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { buildCommandLogEntry, commandLogLabel, shouldRecordCommandLog } from './command-log.ts';
import type { CommandSpec, CommandSubSpec } from './types.ts';

const baseSpec = (name: string): CommandSpec => ({
  name,
  summary: 'x',
  example: 'x',
  requiresVault: true,
  input: 'none',
});

describe('commandLogLabel', () => {
  it('includes subcommand names in lowercase', () => {
    const spec = baseSpec('todo');
    const sub: CommandSubSpec = {
      name: 'add',
      summary: 'x',
      example: 'x',
      run: () => ({ data: null, human: '' }),
    };
    expect(commandLogLabel(spec, sub)).toBe('todo add');
    expect(commandLogLabel(baseSpec('search'), undefined)).toBe('search');
  });
});

describe('shouldRecordCommandLog', () => {
  it('skips stats so metrics are not self-referential', () => {
    expect(shouldRecordCommandLog(baseSpec('stats'))).toBe(false);
    expect(shouldRecordCommandLog(baseSpec('search'))).toBe(true);
  });
});

describe('buildCommandLogEntry', () => {
  it('records outgoing links for successful new commands', () => {
    const entry = buildCommandLogEntry(
      baseSpec('new'),
      undefined,
      {
        data: { links: { resolved: [{}, {}], pending: [{}] } },
        human: '',
      },
      EXIT_CODES.ok,
      42.2,
    );
    expect(entry).toMatchObject({
      command: 'new',
      ok: true,
      durationMs: 42,
      outgoingLinks: 3,
    });
    expect(entry.ts.length).toBeGreaterThan(0);
  });

  it('records validation error counts for failed new commands', () => {
    const entry = buildCommandLogEntry(
      baseSpec('new'),
      undefined,
      {
        data: null,
        human: '',
        warnings: [{ code: 'W_REL_UNKNOWN' }, { code: 'W_REL_UNKNOWN' }],
      },
      EXIT_CODES.usage,
      10,
    );
    expect(entry).toMatchObject({
      ok: false,
      validationErrors: 2,
    });
  });
});
