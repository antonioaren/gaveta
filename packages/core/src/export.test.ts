import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { vaultPath } from '@gaveta/fixtures';
import { exportVaultToMarkdown } from './export.ts';
import { initVault } from './vault/init.ts';
import { openVaultIndex } from './sqlite/store.ts';
import { GavetaError } from './errors.ts';

async function withExportFixture(
  run: (ctx: { readonly vault: string; readonly out: string }) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-'));
  const vault = join(parent, 'vault');
  const out = join(parent, 'out');
  try {
    await cp(vaultPath('backlinks'), vault, { recursive: true });
    const index = await openVaultIndex(vault);
    try {
      await index.rebuild();
    } finally {
      index.close();
    }
    await run({ vault, out });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

describe('exportVaultToMarkdown', () => {
  it('exports --all with folder hierarchy and attachments', async () => {
    await withExportFixture(async ({ vault, out }) => {
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        all: true,
        outDir: out,
        format: 'md',
        links: 'wiki',
      });
      expect(report.dryRun).toBe(false);
      expect(report.notes.length).toBeGreaterThan(20);
      expect(report.notes.some((entry) => entry.path === 'enlaces/enlace-01.md')).toBe(true);
      expect(report.attachments).toContain('attachments/pixel.png');
      const pixel = await readFile(join(out, 'attachments/pixel.png'));
      expect(pixel.length).toBeGreaterThan(0);
      const notaX = await readFile(join(out, 'nota-x.md'), 'utf8');
      expect(notaX).toContain('attachments/pixel.png');
    });
  });

  it('exports a single note by ref', async () => {
    await withExportFixture(async ({ vault, out }) => {
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        ref: 'nota-x.html',
        outDir: out,
        format: 'md',
      });
      expect(report.notes).toHaveLength(1);
      expect(report.notes[0]?.path).toBe('nota-x.md');
    });
  });

  it('exports a folder prefix', async () => {
    await withExportFixture(async ({ vault, out }) => {
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        ref: 'enlaces',
        outDir: out,
        format: 'md',
      });
      expect(report.notes.length).toBe(20);
      expect(report.notes.every((entry) => entry.path.startsWith('enlaces/'))).toBe(true);
    });
  });

  it('rewrites canonical links for wiki and relative modes', async () => {
    await withExportFixture(async ({ vault, out }) => {
      const wikiDir = join(out, 'wiki');
      await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        ref: 'enlaces/enlace-01.html',
        outDir: wikiDir,
        format: 'md',
        links: 'wiki',
      });
      const wikiBody = await readFile(join(wikiDir, 'enlaces/enlace-01.md'), 'utf8');
      expect(wikiBody).toMatch(/\[\[[^\]]+\]\]/);

      const relDir = join(out, 'relative');
      await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        ref: 'enlaces/enlace-01.html',
        outDir: relDir,
        format: 'md',
        links: 'relative',
      });
      const relBody = await readFile(join(relDir, 'enlaces/enlace-01.md'), 'utf8');
      expect(relBody).toContain('.md)');
    });
  });

  it('dry-run writes nothing', async () => {
    await withExportFixture(async ({ vault, out }) => {
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        ref: 'nota-x.html',
        outDir: out,
        format: 'md',
        dryRun: true,
      });
      expect(report.dryRun).toBe(true);
      expect(report.notes[0]?.path).toBe('nota-x.md');
      await expect(readFile(join(out, 'nota-x.md'))).rejects.toThrow();
    });
  });

  it('refuses existing output files unless force is set', async () => {
    await withExportFixture(async ({ vault, out }) => {
      await mkdir(out, { recursive: true });
      await writeFile(join(out, 'nota-x.md'), 'existente', 'utf8');
      await expect(
        exportVaultToMarkdown({
          vaultRoot: vault,
          cwd: vault,
          ref: 'nota-x.html',
          outDir: out,
          format: 'md',
        }),
      ).rejects.toMatchObject({ code: 'E_PATH_EXISTS' });
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        ref: 'nota-x.html',
        outDir: out,
        format: 'md',
        force: true,
      });
      expect(report.notes).toHaveLength(1);
      const body = await readFile(join(out, 'nota-x.md'), 'utf8');
      expect(body).not.toBe('existente');
    });
  });

  it('refuses to write inside the vault', async () => {
    await withExportFixture(async ({ vault }) => {
      await expect(
        exportVaultToMarkdown({
          vaultRoot: vault,
          cwd: vault,
          ref: 'nota-x.html',
          outDir: 'export-md',
          format: 'md',
        }),
      ).rejects.toMatchObject({ code: 'E_ARG_INVALID' });
    });
  });

  it('requires md format and a target', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-empty-'));
    const vault = join(parent, 'vault');
    try {
      await initVault({ cwd: parent, directory: 'vault' });
      await expect(
        exportVaultToMarkdown({
          vaultRoot: vault,
          cwd: parent,
          outDir: join(parent, 'out'),
          format: 'html',
        }),
      ).rejects.toMatchObject({ code: 'E_ARG_INVALID' });
      await expect(
        exportVaultToMarkdown({
          vaultRoot: vault,
          cwd: parent,
          outDir: join(parent, 'out'),
          format: 'md',
        }),
      ).rejects.toBeInstanceOf(GavetaError);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
