import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

it('prints the version when the binary is spawned against an empty directory', () => {
  const manifest: unknown = JSON.parse(
    readFileSync(join(root, 'packages/cli/package.json'), 'utf8'),
  );
  if (typeof manifest !== 'object' || manifest === null || !('version' in manifest)) {
    throw new Error('CLI package.json has no version');
  }
  const version: unknown = manifest.version;
  if (typeof version !== 'string') {
    throw new Error('CLI version is not a string');
  }

  // Later CLI e2e tests copy a fixture vault into this directory and spawn gaveta against it.
  const vault = mkdtempSync(join(tmpdir(), 'gaveta-e2e-'));
  try {
    const output = execFileSync(process.execPath, [join(root, 'packages/cli/bin/gaveta.js')], {
      cwd: vault,
      encoding: 'utf8',
    });
    expect(output).toBe(`gaveta ${version}\n`);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});
