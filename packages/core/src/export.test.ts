import { cp, mkdir, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
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

  it('preflights conflicts and writes nothing when a later note would collide', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-preflight-'));
    const vault = join(parent, 'vault');
    const out = join(parent, 'out');
    const NOTE_A = '01JBP7EXPORTNOTEA00000000001';
    const NOTE_B = '01JBP7EXPORTNOTEB00000000001';
    const CREATED = '2026-10-22T10:00:00Z';
    const html = (id: string, title: string, body: string) =>
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>
<meta name="gaveta:id" content="${id}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="${CREATED}">
<meta name="gaveta:updated" content="${CREATED}">
</head><body><article><h1>${title}</h1>${body}</article></body></html>`;
    try {
      await initVault({ cwd: parent, directory: 'vault' });
      const { writeVaultText } = await import('./vault/paths.ts');
      await writeVaultText(vault, 'a.html', html(NOTE_A, 'Alfa', '<p>primera</p>'));
      await writeVaultText(vault, 'b.html', html(NOTE_B, 'Beta', '<p>segunda</p>'));
      await mkdir(out, { recursive: true });
      await writeFile(join(out, 'b.md'), 'bloqueo', 'utf8');
      await expect(
        exportVaultToMarkdown({
          vaultRoot: vault,
          cwd: parent,
          all: true,
          outDir: out,
          format: 'md',
        }),
      ).rejects.toMatchObject({ code: 'E_PATH_EXISTS' });
      await expect(access(join(out, 'a.md'), constants.F_OK)).rejects.toThrow();
      const body = await readFile(join(out, 'b.md'), 'utf8');
      expect(body).toBe('bloqueo');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('reports conflicts on dry-run without writing or throwing', async () => {
    await withExportFixture(async ({ vault, out }) => {
      await mkdir(out, { recursive: true });
      await writeFile(join(out, 'nota-x.md'), 'existente', 'utf8');
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        ref: 'nota-x.html',
        outDir: out,
        format: 'md',
        dryRun: true,
      });
      expect(report.blocked).toBe(true);
      expect(report.conflicts.length).toBeGreaterThan(0);
      expect(report.conflicts[0]?.code).toBe('E_PATH_EXISTS');
      const kept = await readFile(join(out, 'nota-x.md'), 'utf8');
      expect(kept).toBe('existente');
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

  it('resolves link targets from note HTML when the index is stale', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-stale-'));
    const vault = join(parent, 'vault');
    const out = join(parent, 'out');
    const NOTE_A = '01JBP7EXPORTSTALE00000000001';
    const NOTE_B = '01JBP7EXPORTSTALE00000000002';
    const CREATED = '2026-10-22T10:00:00Z';
    try {
      await initVault({ cwd: parent, directory: 'vault' });
      const { writeVaultText } = await import('./vault/paths.ts');
      await writeVaultText(
        vault,
        'destino.html',
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Destino</title>
<meta name="gaveta:id" content="${NOTE_B}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="${CREATED}">
<meta name="gaveta:updated" content="${CREATED}">
</head><body><article><h1>Destino</h1><p>fin</p></article></body></html>`,
      );
      await writeVaultText(
        vault,
        'origen.html',
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Origen</title>
<meta name="gaveta:id" content="${NOTE_A}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="${CREATED}">
<meta name="gaveta:updated" content="${CREATED}">
</head><body><article><h1>Origen</h1>
<p><a href="destino.html" data-g-to="${NOTE_B}" rel="related">Destino</a></p>
</article></body></html>`,
      );
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: parent,
        ref: 'origen.html',
        outDir: out,
        format: 'md',
        links: 'wiki',
      });
      const wiki = await readFile(join(out, 'origen.md'), 'utf8');
      expect(wiki).toContain('[[Destino]]');
      expect(report.notes).toHaveLength(1);

      const relOut = join(parent, 'out-rel');
      await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: parent,
        ref: 'origen.html',
        outDir: relOut,
        format: 'md',
        links: 'relative',
      });
      const relative = await readFile(join(relOut, 'origen.md'), 'utf8');
      expect(relative).toContain('](destino.md)');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('copies vault assets linked from anchors and media elements', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-media-'));
    const vault = join(parent, 'vault');
    const out = join(parent, 'out');
    try {
      await initVault({ cwd: parent, directory: 'vault' });
      const { writeVaultText } = await import('./vault/paths.ts');
      await mkdir(join(vault, 'attachments'), { recursive: true });
      await writeFile(join(vault, 'attachments', 'doc.pdf'), '%PDF-1.4', 'utf8');
      await writeFile(join(vault, 'attachments', 'clip.mp3'), 'ID3', 'utf8');
      await writeVaultText(
        vault,
        'media.html',
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Media</title>
<meta name="gaveta:id" content="01JBP7EXPORTMEDIA000000000001">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
<meta name="gaveta:updated" content="2026-10-22T10:00:00Z">
</head><body><article><h1>Media</h1>
<p><a href="attachments/doc.pdf">PDF</a></p>
<video src="attachments/clip.mp3" poster="attachments/poster.png"></video>
</article></body></html>`,
      );
      await writeFile(join(vault, 'attachments', 'poster.png'), 'PNG', 'utf8');
      const report = await exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: parent,
        ref: 'media.html',
        outDir: out,
        format: 'md',
      });
      expect(report.attachments).toEqual(
        expect.arrayContaining([
          'attachments/doc.pdf',
          'attachments/clip.mp3',
          'attachments/poster.png',
        ]),
      );
      await expect(readFile(join(out, 'attachments', 'doc.pdf'), 'utf8')).resolves.toBe('%PDF-1.4');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects case-insensitive markdown path collisions in preflight', async (ctx) => {
    if (process.platform === 'darwin') {
      ctx.skip();
    }
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-case-'));
    const vault = join(parent, 'vault');
    const out = join(parent, 'out');
    const CREATED = '2026-10-22T10:00:00Z';
    const shell = (id: string, title: string) =>
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>
<meta name="gaveta:id" content="${id}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="${CREATED}">
<meta name="gaveta:updated" content="${CREATED}">
</head><body><article><h1>${title}</h1></article></body></html>`;
    try {
      await initVault({ cwd: parent, directory: 'vault' });
      const { writeVaultText } = await import('./vault/paths.ts');
      await writeVaultText(vault, 'Foo.html', shell('01JBP7EXPORTCASE000000000001', 'Foo'));
      await writeVaultText(vault, 'foo.html', shell('01JBP7EXPORTCASE000000000002', 'foo'));
      await expect(
        exportVaultToMarkdown({
          vaultRoot: vault,
          cwd: parent,
          all: true,
          outDir: out,
          format: 'md',
        }),
      ).rejects.toMatchObject({ code: 'E_PATH_EXISTS' });
      await expect(access(join(out, 'Foo.md'), constants.F_OK)).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
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
