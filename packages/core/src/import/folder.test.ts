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

  it('assigns distinct slug paths when different sources slug to the same vault path', async () => {
    await withVault(async (root) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-import-slug-'));
      try {
        await writeFile(join(source, 'foo bar.md'), '# spaced\n');
        await writeFile(join(source, 'foo-bar.md'), '# hyphen\n');
        await writeFile(join(source, 'Café.md'), '# Cafe\n');
        await writeFile(join(source, 'cafe.md'), '# cafe accent\n');
        const result = await importMarkdownFolder({
          vaultRoot: root,
          sourcePath: source,
          dryRun: true,
          now: () => NOW,
          createId: nextId,
        });
        const paths = result.notes
          .filter((note) => note.action !== 'skip')
          .map((note) => note.path);
        expect(new Set(paths).size).toBe(4);
        expect(paths).toContain('foo-bar.html');
        expect(paths).toContain('foo-bar-2.html');
        expect(paths).toContain('cafe.html');
        expect(paths).toContain('cafe-2.html');
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  // APFS default volume is case-insensitive; Foo.md and foo.md are one file on disk.
  it.skipIf(process.platform === 'darwin')(
    'assigns distinct slug paths for case-only collisions in one batch',
    async () => {
      await withVault(async (root) => {
        const source = await mkdtemp(join(tmpdir(), 'gaveta-import-slug-case-'));
        try {
          await writeFile(join(source, 'Foo.md'), '# Foo\n');
          await writeFile(join(source, 'foo.md'), '# foo\n');
          const result = await importMarkdownFolder({
            vaultRoot: root,
            sourcePath: source,
            dryRun: true,
            now: () => NOW,
            createId: nextId,
          });
          const paths = result.notes
            .filter((note) => note.action !== 'skip')
            .map((note) => note.path);
          expect(new Set(paths).size).toBe(2);
          expect(paths).toContain('foo.html');
          expect(paths).toContain('foo-2.html');
        } finally {
          await rm(source, { recursive: true, force: true });
        }
      });
    },
  );

  it('slugifies imported note file names', async () => {
    await withVault(async (root) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-import-slug-name-'));
      try {
        await writeFile(join(source, 'Mi Nota Ñandú.md'), '# Titulo\n');
        const result = await importMarkdownFolder({
          vaultRoot: root,
          sourcePath: source,
          now: () => NOW,
          createId: nextId,
        });
        expect(result.ok).toBe(true);
        expect(result.notes[0]?.path).toBe('mi-nota-nandu.html');
        await stat(join(root, 'mi-nota-nandu.html'));
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it('drops pass-2 failures from the overlay and re-resolves dependents with continue-on-error', async () => {
    await withVault(async (root) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-import-pass2-'));
      try {
        await writeFile(
          join(source, 'bad.md'),
          '---\ntype: artifact\n---\n# Bad\n<iframe src="https://example.com"></iframe>\n',
        );
        await writeFile(join(source, 'links.md'), '# Links\n[peer](bad.md)\n');
        const result = await importMarkdownFolder({
          vaultRoot: root,
          sourcePath: source,
          continueOnError: true,
          now: () => NOW,
          createId: nextId,
        });
        const badFailure = result.failures.find((failure) => failure.sourceMd === 'bad.md');
        expect(badFailure).toBeDefined();
        expect(badFailure?.code).not.toBe('E_IMPORT_PARSE');
        expect(result.notes.some((note) => note.sourceMd === 'links.md')).toBe(true);
        const doctor = await doctorVault(root);
        expect(doctor.findings.some((finding) => finding.code === 'E_LINK_BROKEN')).toBe(false);
        const linksHtml = await readFile(join(root, 'links.html'), 'utf8');
        expect(linksHtml).toContain('data-g-pending');
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it('resolves relative links to skipped notes against the existing vault note', async () => {
    await withVault(async (root) => {
      await importMarkdownFolder({
        vaultRoot: root,
        sourcePath: MARKDOWN,
        now: () => NOW,
        createId: nextId,
      });
      const existing = parseNote(await readFile(join(root, 'indice.html'), 'utf8')).note;
      expect(existing?.id).toBeDefined();
      const source = await mkdtemp(join(tmpdir(), 'gaveta-import-skip-link-'));
      try {
        await mkdir(join(source, 'enlaces'));
        await writeFile(join(source, 'indice.md'), '# Indice reimport\n');
        await writeFile(
          join(source, 'enlaces/to-indice.md'),
          '# To indice\n[home](../indice.md)\n',
        );
        const result = await importMarkdownFolder({
          vaultRoot: root,
          sourcePath: source,
          onConflict: 'skip',
          now: () => NOW,
          createId: nextId,
        });
        const linker = result.notes.find((note) => note.sourceMd === 'enlaces/to-indice.md');
        expect(linker?.links.some((link) => link.targetId === existing?.id)).toBe(true);
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it('reports every note not written when commit fails with continue-on-error', async () => {
    await withVault(async (root) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-import-commit-fail-'));
      try {
        await mkdir(join(source, 'a'));
        await mkdir(join(source, 'b'));
        await writeFile(join(source, 'a/one.md'), '# One\n');
        await writeFile(join(source, 'b/two.md'), '# Two\n');
        await mkdir(join(root, 'dest'), { recursive: true });
        await chmod(join(root, 'dest'), 0o555);
        try {
          const result = await importMarkdownFolder({
            vaultRoot: root,
            sourcePath: source,
            in: 'dest',
            continueOnError: true,
            now: () => NOW,
            createId: nextId,
          });
          expect(result.ok).toBe(false);
          const failedPaths = result.failures.map((failure) => failure.sourceMd).sort();
          expect(failedPaths).toEqual(['a/one.md', 'b/two.md']);
          expect(result.failures.every((failure) => failure.code === 'E_IMPORT_ABORTED')).toBe(
            true,
          );
        } finally {
          await chmod(join(root, 'dest'), 0o755);
        }
      } finally {
        await rm(source, { recursive: true, force: true });
      }
    });
  });

  it('imports a single markdown file into --in', async () => {
    await withVault(async (root) => {
      const source = await mkdtemp(join(tmpdir(), 'gaveta-import-single-'));
      try {
        await writeFile(join(source, 'solo.md'), '# Solo\n\nTexto.\n');
        const result = await importMarkdownFolder({
          vaultRoot: root,
          sourcePath: join(source, 'solo.md'),
          in: 'importado',
          now: () => NOW,
          createId: nextId,
        });
        expect(result.ok).toBe(true);
        expect(result.notes).toHaveLength(1);
        expect(result.notes[0]?.path).toBe('importado/solo.html');
        expect(result.notes[0]?.action).toBe('create');
        await stat(join(root, 'importado/solo.html'));
      } finally {
        await rm(source, { recursive: true, force: true });
      }
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
