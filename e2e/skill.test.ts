import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLOBAL_CLI_FLAGS, buildCliSurface, commands } from '@gaveta/cli';
import { findInvalidSkillMentions } from '@gaveta/core';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const skillMd = join(root, 'skills', 'gaveta', 'SKILL.md');

it('ships the Gaveta agent skill with vault guidance and valid CLI mentions', () => {
  const text = readFileSync(skillMd, 'utf8');
  expect(text).toContain('name: gaveta');
  expect(text).toContain('gaveta-cli-version:');
  expect(text).toContain('GAVETA_VAULT');
  expect(text).toContain('gaveta doctor --json');
  expect(text).toContain('gaveta guide');

  const surface = buildCliSurface(commands);
  const issues = findInvalidSkillMentions(text, {
    commands: surface.commands,
    subcommands: surface.subcommands,
    globalFlags: GLOBAL_CLI_FLAGS,
    flagsFor: surface.flagsFor.bind(surface),
  });
  expect(issues).toEqual([]);
});
