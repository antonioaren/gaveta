import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { markdownVaultPath } from '@gaveta/fixtures';
import { exportVaultToMarkdown, importMarkdownFolder, initVault } from './index.ts';

const FIXTURE_NOTES = ['enlaces/enlaces-relativos.html', 'no-soportado/notas-al-pie.html'] as const;

describe('exportVaultToMarkdown (markdown fixture)', () => {
  it('exports single-note refs with the same markdown as --all', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-md-fixture-'));
    const vault = join(parent, 'vault');
    try {
      await mkdir(vault);
      await initVault({ cwd: parent, directory: 'vault' });
      await importMarkdownFolder({ vaultRoot: vault, sourcePath: markdownVaultPath() });

      const allOut = join(parent, 'all');
      await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: parent,
        all: true,
        outDir: allOut,
        format: 'md',
        links: 'relative',
      });

      for (const ref of FIXTURE_NOTES) {
        const singleOut = join(parent, `single-${ref.replace(/\//g, '-')}`);
        const report = await exportVaultToMarkdown({
          vaultRoot: vault,
          cwd: parent,
          ref,
          outDir: singleOut,
          format: 'md',
          links: 'relative',
        });
        expect(report.notes).toHaveLength(1);
        const mdPath = ref.replace(/\.html$/i, '.md');
        const singleMd = await readFile(join(singleOut, mdPath), 'utf8');
        const allMd = await readFile(join(allOut, mdPath), 'utf8');
        expect(singleMd, ref).toBe(allMd);
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('resolves note paths without the .html suffix', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-md-ref-'));
    const vault = join(parent, 'vault');
    try {
      await mkdir(vault);
      await initVault({ cwd: parent, directory: 'vault' });
      await importMarkdownFolder({ vaultRoot: vault, sourcePath: markdownVaultPath() });
      const out = join(parent, 'out');
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: parent,
        ref: 'enlaces/enlaces-relativos',
        outDir: out,
        format: 'md',
      });
      expect(report.notes[0]?.source).toBe('enlaces/enlaces-relativos.html');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
