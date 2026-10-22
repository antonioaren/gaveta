import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { CLI_PACKAGE_ID, LINKED_CORE_PACKAGE_ID } from './index.ts';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

interface CliManifest {
  bin: {
    gaveta: string;
    gv: string;
  };
  version: string;
}

it('links the CLI to core', () => {
  expect(CLI_PACKAGE_ID).toBe('@gaveta/cli');
  expect(LINKED_CORE_PACKAGE_ID).toBe('@gaveta/core');
});

it('exposes gaveta and gv as the same binary', () => {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8'),
  ) as CliManifest;
  expect(manifest.bin.gaveta).toBe('./bin/gaveta.js');
  expect(manifest.bin.gv).toBe(manifest.bin.gaveta);

  const output = execFileSync(process.execPath, [join(packageRoot, 'bin', 'gaveta.js')], {
    encoding: 'utf8',
  });
  expect(output).toBe(`gaveta ${manifest.version}\n`);
});
