import { chmod, cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { vaultPath } from '@gaveta/fixtures';
import { GavetaError, doctorVault } from './index.ts';

async function withTemp(run: (parent: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-doctor-sec-'));
  try {
    await run(parent);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

it('refuses to fix through a symlink that leaves the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const outside = join(parent, 'outside');
    await mkdir(outside, { recursive: true });
    await mkdir(join(root, '.gaveta'), { recursive: true });
    await writeFile(
      join(outside, 'secret.html'),
      '<!doctype html><html><body>secret</body></html>',
    );
    await symlink(join(outside, 'secret.html'), join(root, 'escape.html'));
    await expect(doctorVault(root, { fix: true })).rejects.toBeInstanceOf(GavetaError);
  });
});

it('does not sanitize malicious notes when only scanning', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'malicious');
    await cp(vaultPath('malicious'), root, { recursive: true });
    const before = await readFile(join(root, 'script.html'), 'utf8');
    const report = await doctorVault(root);
    expect(report.ok).toBe(false);
    expect(report.fixed).toEqual([]);
    const after = await readFile(join(root, 'script.html'), 'utf8');
    expect(after).toBe(before);
    expect(after).toContain('<script>');
  });
});

it('rolls back a failed fix batch', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'problems');
    await cp(vaultPath('problems'), root, { recursive: true });
    const nestedDir = join(root, 'anidada');
    const before = await readFile(join(root, 'href-desfasado.html'), 'utf8');
    await chmod(nestedDir, 0o555);
    try {
      await expect(doctorVault(root, { fix: true })).rejects.toMatchObject({ code: 'EACCES' });
      const after = await readFile(join(root, 'href-desfasado.html'), 'utf8');
      expect(after).toBe(before);
    } finally {
      await chmod(nestedDir, 0o755);
    }
  });
});
