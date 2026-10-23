import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseJson, runGaveta, withTempVault, type JsonEnvelope } from './helpers.ts';

interface ExportPayload {
  readonly dryRun: boolean;
  readonly outDir: string;
  readonly notes: { readonly path: string; readonly source: string }[];
  readonly attachments: string[];
}

describe('gaveta export', () => {
  it('exports a fixture vault with hierarchy, attachments, and link modes', () => {
    withTempVault(
      (vault) => {
        const out = join(vault, '..', 'markdown-out');
        const wiki = runGaveta(
          ['export', '--all', '--to', 'md', '--out', out, '--links', 'wiki', '--json'],
          { vault },
        );
        expect(wiki.status).toBe(0);
        expect(wiki.stderr).toBe('');
        const wikiBody = parseJson<ExportPayload>(wiki.stdout);
        expect(wikiBody.ok).toBe(true);
        expect(wikiBody.data.notes.length).toBeGreaterThan(20);
        expect(wikiBody.data.attachments).toContain('attachments/pixel.png');
        expect(existsSync(join(out, 'enlaces', 'enlace-01.md'))).toBe(true);
        expect(existsSync(join(out, 'attachments', 'pixel.png'))).toBe(true);

        const relOut = join(vault, '..', 'markdown-relative');
        const relative = runGaveta(
          [
            'export',
            'enlaces/enlace-01.html',
            '--to',
            'md',
            '--out',
            relOut,
            '--links',
            'relative',
            '--json',
          ],
          { vault },
        );
        expect(relative.status).toBe(0);
        const relBody = parseJson<ExportPayload>(relative.stdout);
        expect(relBody.data.notes).toHaveLength(1);
        const md = readFileSync(join(relOut, 'enlaces', 'enlace-01.md'), 'utf8');
        expect(md).toContain('.md)');
      },
      { fixture: 'backlinks' },
    );
  });

  it('supports dry-run without writing files', () => {
    withTempVault(
      (vault) => {
        const out = join(vault, '..', 'dry-export');
        const dry = runGaveta(
          ['export', 'nota-x.html', '--to', 'md', '--out', out, '--dry-run', '--json'],
          { vault },
        );
        expect(dry.status).toBe(0);
        const body = parseJson<ExportPayload>(dry.stdout);
        expect(body.data.dryRun).toBe(true);
        expect(body.data.notes[0]?.path).toBe('nota-x.md');
        expect(existsSync(join(out, 'nota-x.md'))).toBe(false);
      },
      { fixture: 'backlinks' },
    );
  });

  it('rejects export output inside the vault', () => {
    withTempVault(
      (vault) => {
        const inside = runGaveta(
          ['export', 'nota-x.html', '--to', 'md', '--out', 'export-md', '--json'],
          { cwd: vault, vault },
        );
        expect(inside.status).toBe(1);
        const body = JSON.parse(inside.stdout) as JsonEnvelope;
        expect(body.ok).toBe(false);
        expect(body.error?.code).toBe('E_ARG_INVALID');
      },
      { fixture: 'backlinks' },
    );
  });
});
