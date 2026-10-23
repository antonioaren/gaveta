import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initVault } from '../index.ts';
import { collectNoteAttachments, hashBytes, writeVaultBytes } from './attachments.ts';

async function withVault(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-attach-'));
  try {
    const root = join(parent, 'vault');
    await initVault({ cwd: parent, directory: 'vault' });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

describe('collectNoteAttachments', () => {
  it('allocates distinct vault paths when basenames collide across different hashes', async () => {
    await withVault(async (vaultRoot) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-attach-src-'));
      try {
        await mkdir(join(source, 'a'), { recursive: true });
        await mkdir(join(source, 'b'), { recursive: true });
        const bytesA = Buffer.from([0, 1, 2]);
        const bytesB = Buffer.from([3, 4, 5]);
        await writeFile(join(source, 'a/image.png'), bytesA);
        await writeFile(join(source, 'b/image.png'), bytesB);
        const html = '<html><body><img src="a/image.png"/><img src="b/image.png"/></body></html>';
        const hashToVault = new Map<string, string>();
        const takenPaths = new Map<string, string>();
        const first = await collectNoteAttachments({
          sourceRoot: source,
          noteVaultPath: 'nota.html',
          noteSourceMd: 'nota.md',
          html,
          vaultRoot,
          hashToVault,
          takenPaths,
        });
        expect(first.plans).toHaveLength(2);
        const paths = first.plans.map((plan) => plan.vaultPath);
        expect(new Set(paths).size).toBe(2);
        expect(paths).toContain('attachments/image.png');
        expect(paths.some((item) => item === 'attachments/image-2.png')).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it('reuses an existing vault attachment with the same hash and never overwrites differing content', async () => {
    await withVault(async (root) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-attach-src-'));
      try {
        const bytes = Buffer.from('vault-pixel');
        const hash = hashBytes(bytes);
        await mkdir(join(root, 'attachments'), { recursive: true });
        await writeVaultBytes(root, 'attachments/pixel.png', bytes);
        await writeFile(join(source, 'pixel.png'), bytes);
        const other = Buffer.from('other-pixel');
        await writeFile(join(source, 'other.png'), other);
        const html = '<html><body><img src="pixel.png"/><img src="other.png"/></body></html>';
        const hashToVault = new Map<string, string>();
        const takenPaths = new Map<string, string>();
        const result = await collectNoteAttachments({
          sourceRoot: source,
          noteVaultPath: 'nota.html',
          noteSourceMd: 'nota.md',
          html,
          vaultRoot: root,
          hashToVault,
          takenPaths,
        });
        const reused = result.plans.find((plan) => plan.hash === hash);
        expect(reused).toBeUndefined();
        expect(hashToVault.get(hash)).toBe('attachments/pixel.png');
        const otherPlan = result.plans.find((plan) => plan.vaultPath !== 'attachments/pixel.png');
        expect(otherPlan).toBeDefined();
        expect(otherPlan?.vaultPath).not.toBe('attachments/pixel.png');
        const onDisk = await readFile(join(root, 'attachments/pixel.png'));
        expect(onDisk.equals(bytes)).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
