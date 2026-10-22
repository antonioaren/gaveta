import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { CLI_PACKAGE_ID, LINKED_CORE_PACKAGE_ID, SCHEMA_VERSION, commands } from './index.ts';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

interface CliManifest {
  bin: {
    gaveta: string;
    gv: string;
  };
}

it('links the CLI to core', () => {
  expect(CLI_PACKAGE_ID).toBe('@gaveta/cli');
  expect(LINKED_CORE_PACKAGE_ID).toBe('@gaveta/core');
  expect(SCHEMA_VERSION).toBe(1);
  expect(commands.map((command) => command.name)).toContain('version');
});

it('exposes gaveta and gv as the same binary', () => {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8'),
  ) as CliManifest;
  expect(manifest.bin.gaveta).toBe('./bin/gaveta.js');
  expect(manifest.bin.gv).toBe(manifest.bin.gaveta);
});
