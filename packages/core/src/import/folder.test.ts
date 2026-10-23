import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMarkdownManifest, markdownVaultPath } from '@gaveta/fixtures';
import { describe, expect, it } from 'vitest';
import { doctorVault } from '../doctor.ts';
import { GavetaError, initVault, parseNote } from '../index.ts';
import { createUlid } from '../ulid.ts';
import { importMarkdownFolder } from './folder.ts';

const MARKDOWN = markdownVaultPath();
const MANIFEST = loadMarkdownManifest();
const NOW = '2026-10-22T12:00:00.000Z';
let entropy = 0;

function nextId(): string {
  entropy += 1;
  const bytes = Buffer.alloc(10);
  bytes.writeUInt32BE(entropy, 6);
  return createUlid(Date.parse(NOW), bytes);
}

async function withVault(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-import-'));
  try {
    const root = join(parent, 'vault');
    await initVault({ cwd: parent, directory: 'vault' });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function vaultSnapshot(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  async function walk(relative: string, absolute: string): Promise<void> {
    const entries = await readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      const childAbsolute = join(absolute, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.gaveta') {
          continue;
        }
        await walk(childRelative, childAbsolute);
        continue;
      }
      if (entry.isFile()) {
        files.set(childRelative, await readFile(childAbsolute));
      }
    }
  }
  await walk('', root);
  return files;
}

describe('importMarkdownFolder', { timeout: 60_000 }, () => {
  it('imports the markdown fixture vault with link resolution and attachment dedup', async () => {
    await withVault(async (root) => {
      const result = await importMarkdownFolder({
        vaultRoot: root,
        sourcePath: MARKDOWN,
        now: () => NOW,
        createId: nextId,
      });
      expect(result.ok).toBe(true);
      expect(result.dryRun).toBe(false);
      expect(result.notes.length).toBe(MANIFEST.noteCount);
      const imagenes = result.notes.find((note) => note.path === 'contenido/imagenes.html');
      expect(imagenes).toBeDefined();
      const pixelCopies = result.attachments.filter(
        (item) => item.vaultPath === 'attachments/pixel.png',
      );
      expect(pixelCopies.length).toBeGreaterThan(0);
      const uniquePixel = new Set(pixelCopies.map((item) => item.hash));
      expect(uniquePixel.size).toBe(1);
      const wikilinks = await readFile(join(root, 'enlaces/wikilinks.html'), 'utf8');
      expect(wikilinks).toContain('data-g-to=');
      expect(wikilinks).not.toContain('[[Destino Wikilinks]]');
      const doctor = await doctorVault(root);
      const broken = doctor.findings.filter((finding) => finding.code === 'E_LINK_BROKEN');
      expect(broken).toEqual([]);
      const pending = doctor.findings.filter((finding) => finding.code === 'W_LINK_PENDING');
      expect(pending.length).toBe(2);
    });
  });

  it('dry-run leaves the vault byte-identical', async () => {
    await withVault(async (root) => {
      const before = await vaultSnapshot(root);
      const result = await importMarkdownFolder({
        vaultRoot: root,
        sourcePath: MARKDOWN,
        dryRun: true,
        now: () => NOW,
        createId: nextId,
      });
      expect(result.dryRun).toBe(true);
      expect(result.notes.length).toBe(MANIFEST.noteCount);
      const after = await vaultSnapshot(root);
      expect(after).toEqual(before);
    });
  });

  it('reports parse failures without writing when continue-on-error is off', async () => {
    await withVault(async (root) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-import-bad-'));
      try {
        await mkdir(join(source, 'broken'));
        await writeFile(join(source, 'broken/invalid.md'), '---\ntitle: [oops\n---\n# Broken\n');
        const before = await vaultSnapshot(root);
        const result = await importMarkdownFolder({
          vaultRoot: root,
          sourcePath: source,
          now: () => NOW,
          createId: nextId,
        });
        expect(result.ok).toBe(false);
        expect(result.failures.some((failure) => failure.code === 'E_IMPORT_PARSE')).toBe(true);
        const after = await vaultSnapshot(root);
        expect(after).toEqual(before);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it('honors on-conflict skip and overwrite', async () => {
    await withVault(async (root) => {
      await importMarkdownFolder({
        vaultRoot: root,
        sourcePath: MARKDOWN,
        now: () => NOW,
        createId: nextId,
      });
      const existing = await readFile(join(root, 'indice.html'), 'utf8');
      const existingId = parseNote(existing).note?.id;
      expect(existingId).toBeDefined();
      const skipped = await importMarkdownFolder({
        vaultRoot: root,
        sourcePath: MARKDOWN,
        onConflict: 'skip',
        now: () => NOW,
        createId: nextId,
      });
      expect(
        skipped.notes.some((note) => note.warnings.some((w) => w.code === 'W_IMPORT_SKIPPED')),
      ).toBe(true);
      expect(await readFile(join(root, 'indice.html'), 'utf8')).toBe(existing);
      const overwritten = await importMarkdownFolder({
        vaultRoot: root,
        sourcePath: MARKDOWN,
        onConflict: 'overwrite',
        now: () => NOW,
        createId: nextId,
      });
      const report = overwritten.notes.find((note) => note.path === 'indice.html');
      expect(report?.action).toBe('overwrite');
      expect(parseNote(await readFile(join(root, 'indice.html'), 'utf8')).note?.id).toBe(
        existingId,
      );
    });
  });

  it('imports under --in while preserving relative structure', async () => {
    await withVault(async (root) => {
      const result = await importMarkdownFolder({
        vaultRoot: root,
        sourcePath: MARKDOWN,
        in: 'importado',
        now: () => NOW,
        createId: nextId,
      });
      expect(result.ok).toBe(true);
      expect(result.notes.some((note) => note.path === 'importado/enlaces/wikilinks.html')).toBe(
        true,
      );
      await stat(join(root, 'importado/corpus/grupo-a/nota-001.html'));
    });
  });
});

describe('importMarkdownFolder security', { timeout: 60_000 }, () => {
  it('rejects a source symlink that escapes the markdown tree', async () => {
    await withVault(async (root) => {
      const parent = await mkdtemp(join(tmpdir(), 'gaveta-import-escape-'));
      try {
        const outside = join(parent, 'outside');
        await mkdir(outside);
        await writeFile(join(outside, 'evil.md'), '# Evil\n');
        const vault = join(parent, 'vault-md');
        await mkdir(vault);
        await symlink(outside, join(vault, 'escape'));
        await expect(
          importMarkdownFolder({
            vaultRoot: root,
            sourcePath: vault,
            now: () => NOW,
            createId: nextId,
          }),
        ).rejects.toBeInstanceOf(GavetaError);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  });

  it('rolls back when the destination directory is not writable mid-batch', async () => {
    await withVault(async (root) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-import-chmod-'));
      try {
        await mkdir(join(source, 'a'));
        await mkdir(join(source, 'b'));
        await writeFile(join(source, 'a/ok.md'), '# A\n');
        await writeFile(join(source, 'b/bad.md'), '# B\n');
        const before = await vaultSnapshot(root);
        await mkdir(join(root, 'dest'), { recursive: true });
        await chmod(join(root, 'dest'), 0o555);
        try {
          await expect(
            importMarkdownFolder({
              vaultRoot: root,
              sourcePath: source,
              in: 'dest',
              now: () => NOW,
              createId: nextId,
            }),
          ).rejects.toMatchObject({ code: 'E_IMPORT_ABORTED' });
        } finally {
          await chmod(join(root, 'dest'), 0o755);
        }
        const after = await vaultSnapshot(root);
        expect(after).toEqual(before);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });
});
