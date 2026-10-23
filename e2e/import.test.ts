import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadMarkdownManifest, markdownVaultPath } from '@gaveta/fixtures';
import { describe, expect, it } from 'vitest';
import { initVault, parseJson, runGaveta, withTempVault, type JsonEnvelope } from './helpers.ts';

const MARKDOWN = markdownVaultPath();
const MANIFEST = loadMarkdownManifest();

interface MigrationSummary {
  readonly created: number;
  readonly overwritten: number;
  readonly renamed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly attachments: number;
}

interface ImportPayload {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly summary: MigrationSummary;
  readonly notes: {
    readonly sourceMd: string;
    readonly path: string;
    readonly id: string;
    readonly title: string;
    readonly warnings: { code: string }[];
    readonly links: { kind: string }[];
    readonly action: string;
  }[];
  readonly failures: { readonly sourceMd: string; readonly code: string }[];
  readonly attachments: { readonly vaultPath: string; readonly deduplicated: boolean }[];
}

function stableImportSnapshot(data: ImportPayload): unknown {
  return {
    ok: data.ok,
    dryRun: data.dryRun,
    summary: data.summary,
    notes: data.notes
      .map((note) => ({
        sourceMd: note.sourceMd,
        path: note.path,
        action: note.action,
        title: note.title,
        warningCodes: note.warnings.map((warning) => warning.code).sort(),
        linkKinds: note.links.map((link) => link.kind).sort(),
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    failureCodes: [...new Set(data.failures.map((failure) => failure.code))].sort(),
    attachmentPaths: data.attachments.map((attachment) => attachment.vaultPath).sort(),
  };
}

function stableExportSnapshot(data: ExportPayload): unknown {
  return {
    ok: data.ok,
    dryRun: data.dryRun,
    blocked: data.blocked,
    summary: data.summary,
    notePaths: data.notes.map((note) => note.path).sort(),
    sources: data.notes.map((note) => note.source).sort(),
    attachments: [...data.attachments].sort(),
    conflictPaths: data.conflicts.map((conflict) => conflict.path).sort(),
  };
}

interface ExportPayload {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly blocked: boolean;
  readonly outDir: string;
  readonly summary: MigrationSummary;
  readonly notes: { readonly path: string; readonly source: string }[];
  readonly attachments: string[];
  readonly conflicts: { readonly path: string }[];
}

describe('gaveta import and export', () => {
  it('imports the markdown fixture, exports it back, and matches JSON snapshots', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-mig-e2e-'));
    const vault = join(parent, 'vault');
    try {
      mkdirSync(vault);
      initVault(vault);
      const imported = runGaveta(['import', MARKDOWN, '--json'], { cwd: parent, vault });
      expect(imported.status).toBe(0);
      expect(imported.stderr).toBe('');
      const importBody = parseJson<ImportPayload>(imported.stdout);
      expect(importBody.command).toBe('import');
      expect(importBody.schemaVersion).toBe(1);
      expect(importBody.data.summary.created).toBe(MANIFEST.noteCount);
      expect(importBody.data.notes.length).toBe(MANIFEST.noteCount);
      expect(stableImportSnapshot(importBody.data)).toMatchSnapshot();

      const out = join(parent, 'export-md');
      const exported = runGaveta(
        ['export', '--all', '--to', 'md', '--out', out, '--links', 'wiki', '--json'],
        { cwd: parent, vault },
      );
      expect(exported.status).toBe(0);
      const exportBody = parseJson<ExportPayload>(exported.stdout);
      expect(exportBody.data.summary.created).toBe(MANIFEST.noteCount);
      expect(exportBody.data.attachments).toContain('attachments/pixel.png');
      expect(existsSync(join(out, 'indice.md'))).toBe(true);
      expect(stableExportSnapshot(exportBody.data)).toMatchSnapshot();
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('imports a single file under --in and supports dry-run plus conflicts', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-mig-single-'));
    const vault = join(parent, 'vault');
    const source = join(parent, 'nota.md');
    try {
      mkdirSync(vault);
      initVault(vault);
      writeFileSync(source, '# Importada\n\n[[Indice]]\n');
      const dry = runGaveta(['import', source, '--in', 'entrada', '--dry-run', '--json'], {
        cwd: parent,
        vault,
      });
      expect(dry.status).toBe(0);
      const dryBody = parseJson<ImportPayload>(dry.stdout);
      expect(dryBody.data.dryRun).toBe(true);
      expect(dryBody.data.notes[0]?.path).toBe('entrada/nota.html');
      expect(existsSync(join(vault, 'entrada/nota.html'))).toBe(false);

      const created = runGaveta(['import', source, '--in', 'entrada', '--json'], {
        cwd: parent,
        vault,
      });
      expect(created.status).toBe(0);
      const html = readFileSync(join(vault, 'entrada/nota.html'), 'utf8');
      expect(html).toContain('Importada');

      const skipped = runGaveta(
        ['import', source, '--in', 'entrada', '--on-conflict', 'skip', '--json'],
        { cwd: parent, vault },
      );
      expect(skipped.status).toBe(0);
      const skipBody = parseJson<ImportPayload>(skipped.stdout);
      expect(skipBody.data.summary.skipped).toBe(1);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('rejects symlink escapes in the markdown source tree', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-mig-sec-'));
    const vault = join(parent, 'vault');
    try {
      mkdirSync(vault);
      initVault(vault);
      const outside = join(parent, 'outside');
      const tree = join(parent, 'tree');
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, 'evil.md'), '# Evil\n');
      mkdirSync(tree);
      symlinkSync(outside, join(tree, 'escape'));
      const result = runGaveta(['import', tree, '--json'], { cwd: parent, vault });
      expect(result.status).toBe(1);
      const body = JSON.parse(result.stdout) as JsonEnvelope;
      expect(body.error?.code).toBe('E_PATH_OUTSIDE_VAULT');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
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
        expect(body.error?.code).toBe('E_ARG_INVALID');
      },
      { fixture: 'backlinks' },
    );
  });
});
