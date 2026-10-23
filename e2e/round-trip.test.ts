import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { markdownVaultPath } from '@gaveta/fixtures';
import { describe, expect, it } from 'vitest';
import { initVault, runGaveta } from './helpers.ts';

describe('markdown migration round-trip (REQ-MIG-11)', () => {
  it('imports the markdown fixture and round-trips a corpus note through export and import', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-rt-e2e-'));
    const vault = join(parent, 'vault');
    const exportDir = join(parent, 'export-md');
    try {
      mkdirSync(vault);
      initVault(vault);
      const imported = runGaveta(['import', markdownVaultPath(), '--json'], { cwd: parent, vault });
      expect(imported.status).toBe(0);

      const exported = runGaveta(
        [
          'export',
          'corpus/grupo-a/nota-001.html',
          '--to',
          'md',
          '--out',
          exportDir,
          '--links',
          'wiki',
          '--json',
        ],
        { cwd: parent, vault },
      );
      expect(exported.status).toBe(0);

      const mdPath = join(exportDir, 'corpus', 'grupo-a', 'nota-001.md');
      const before = readFileSync(join(vault, 'corpus/grupo-a/nota-001.html'), 'utf8');
      const idBefore = /name="gaveta:id" content="([^"]+)"/.exec(before)?.[1];
      expect(idBefore).toBeDefined();

      const reimported = runGaveta(
        ['import', mdPath, '--in', 'corpus/grupo-a', '--on-conflict', 'overwrite', '--json'],
        { cwd: parent, vault },
      );
      expect(reimported.status).toBe(0);

      const after = readFileSync(join(vault, 'corpus/grupo-a/nota-001.html'), 'utf8');
      const idAfter = /name="gaveta:id" content="([^"]+)"/.exec(after)?.[1];
      expect(idAfter).toBe(idBefore);
      expect(after).toContain('Nota 001');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
