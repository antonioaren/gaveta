import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readWorkspaceVersion } from '@gaveta/core';

const root = join(import.meta.dirname, '..');
const packages = [
  'package.json',
  'packages/cli/package.json',
  'packages/core/package.json',
  'packages/server/package.json',
  'apps/web/package.json',
  'fixtures/package.json',
];

it('keeps workspace package versions in sync with VERSION', () => {
  const version = readWorkspaceVersion();
  expect(readFileSync(join(root, 'VERSION'), 'utf8').trim()).toBe(version);
  for (const manifestPath of packages) {
    const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8')) as {
      version: string;
    };
    expect(manifest.version).toBe(version);
  }
});
