import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CREATED } from './constants.ts';
import {
  NFR_NOTE_COUNTS,
  NFR_SEED,
  NFR_SQLITE_NOTE_INDEX,
  generateVault,
  generatedNotePath,
  generatedNoteTitle,
  writeVault,
  type GeneratedFile,
} from './generate.ts';
import { inspectNote, metaContents } from './inspect.ts';
import { resolveInsideVault, themeHrefFor, vaultPath } from './paths.ts';
import { slugify } from './slug.ts';
import { ULID_PATTERN, noteUlid } from './ulid.ts';

const GOLDEN: Record<(typeof NFR_NOTE_COUNTS)[number], string> = {
  1000: '2d915e2d7f505113a9c4a5fc80d1ae4cd20a37c0a53d5d2033b5270577773563',
  5000: 'dbe0b44365440f0ca3c1bc7768c043a0915ff6a2d41c6f2d0fdef6caa5fb9735',
};

function fingerprint(files: readonly GeneratedFile[]): string {
  const hash = createHash('sha256');
  const ordered = [...files].sort((left, right) => {
    if (left.path < right.path) {
      return -1;
    }
    if (left.path > right.path) {
      return 1;
    }
    return 0;
  });
  for (const file of ordered) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function htmlFiles(files: readonly GeneratedFile[]): GeneratedFile[] {
  return files.filter((file) => file.path.endsWith('.html'));
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gaveta-fixtures-'));
  tempDirs.push(dir);
  return dir;
}

describe('NFR vault generator', () => {
  it('rejects note counts other than 1000 and 5000 and seeds that are not uint32', () => {
    expect(() => generateVault({ noteCount: 999, seed: 1 })).toThrow(/1000 or 5000/);
    expect(() => generateVault({ noteCount: 0, seed: 1 })).toThrow(/1000 or 5000/);
    expect(() => generateVault({ noteCount: 1000.5, seed: 1 })).toThrow(/1000 or 5000/);
    expect(() => generateVault({ noteCount: 1000, seed: -1 })).toThrow(/seed/);
    expect(() => generateVault({ noteCount: 1000, seed: 1.5 })).toThrow(/seed/);
    expect(() => generateVault({ noteCount: 1000, seed: 0x1_0000_0000 })).toThrow(/seed/);
  });

  it.each(NFR_NOTE_COUNTS)('builds %i deterministic notes for seed 1', (noteCount) => {
    const first = generateVault({ noteCount, seed: NFR_SEED });
    const second = generateVault({ noteCount, seed: NFR_SEED });
    expect(fingerprint(first)).toBe(fingerprint(second));
    expect(fingerprint(first)).toBe(GOLDEN[noteCount]);
    expect(first.map((file) => file.path)).toEqual(second.map((file) => file.path));

    const mutated = first[0];
    if (mutated === undefined) {
      throw new Error('vault is empty');
    }
    mutated.contents = 'changed';
    expect(fingerprint(generateVault({ noteCount, seed: NFR_SEED }))).toBe(GOLDEN[noteCount]);
  });

  it('keeps paths stable when the seed changes and changes ids', () => {
    const low = generateVault({ noteCount: 1000, seed: NFR_SEED });
    const high = generateVault({ noteCount: 1000, seed: 2 });
    expect(low.map((file) => file.path)).toEqual(high.map((file) => file.path));
    expect(fingerprint(low)).not.toBe(fingerprint(high));
    const lowNote = htmlFiles(low)[0];
    const highNote = htmlFiles(high)[0];
    if (lowNote === undefined || highNote === undefined) {
      throw new Error('missing generated note');
    }
    expect(metaContents(inspectNote(lowNote.contents), 'gaveta:id')).not.toEqual(
      metaContents(inspectNote(highNote.contents), 'gaveta:id'),
    );
  });

  it.each(NFR_NOTE_COUNTS)('emits %i well-formed linked notes plus the skeleton', (noteCount) => {
    const files = generateVault({ noteCount, seed: NFR_SEED });
    expect(files.map((file) => file.path)).toEqual([...files.map((file) => file.path)].sort());
    const notes = htmlFiles(files);
    expect(notes).toHaveLength(noteCount);
    expect(files).toHaveLength(noteCount + 2);

    const skeletonDir = join(vaultPath('empty'), '.gaveta');
    expect(files.find((file) => file.path === '.gaveta/config.json')?.contents).toBe(
      readFileSync(join(skeletonDir, 'config.json'), 'utf8'),
    );
    expect(files.find((file) => file.path === '.gaveta/theme.css')?.contents).toBe(
      readFileSync(join(skeletonDir, 'theme.css'), 'utf8'),
    );

    const byPath = new Map(notes.map((file) => [file.path, file]));
    const ids = new Set<string>();
    const sqlitePaths: string[] = [];

    for (let index = 0; index < noteCount; index += 1) {
      const path = generatedNotePath(index);
      const file = byPath.get(path);
      if (file === undefined) {
        throw new Error(`missing ${path}`);
      }
      expect(file.contents.endsWith('\n')).toBe(true);
      expect(file.contents.includes('\r')).toBe(false);
      expect(file.contents.startsWith('<!doctype html>\n')).toBe(true);

      const note = inspectNote(file.contents);
      const id = metaContents(note, 'gaveta:id');
      expect(id).toEqual([noteUlid(NFR_SEED, index)]);
      expect(id[0]).toMatch(ULID_PATTERN);
      ids.add(id[0] ?? '');
      expect(metaContents(note, 'gaveta:type')).toEqual(['doc']);
      expect(metaContents(note, 'gaveta:tags')).toEqual(['nfr']);
      expect(metaContents(note, 'gaveta:created')).toEqual([CREATED]);
      expect(metaContents(note, 'gaveta:aliases')).toEqual([]);
      expect(note.title).toBe(generatedNoteTitle(index));
      expect(note.h1).toBe(note.title);
      expect(path.endsWith(`/${slugify(note.title ?? '')}.html`)).toBe(true);
      expect(note.stylesheetHrefs).toEqual([themeHrefFor(path)]);
      expect(note.anchors).toHaveLength(2);
      expect(note.wikilinks).toEqual([]);
      expect(note.hasArticle).toBe(true);
      expect(file.contents.includes('<script')).toBe(false);
      expect(file.contents.includes('data-g-pending')).toBe(false);

      if (file.contents.includes('sqlite')) {
        sqlitePaths.push(path);
      }

      for (const [offset, anchor] of [
        [1, note.anchors[0]],
        [10, note.anchors[1]],
      ] as const) {
        if (anchor === undefined) {
          throw new Error(`missing link ${String(offset)} on ${path}`);
        }
        const targetIndex = (index + offset) % noteCount;
        const targetPath = generatedNotePath(targetIndex);
        expect(anchor.to).toBe(noteUlid(NFR_SEED, targetIndex));
        expect(anchor.href).not.toBeNull();
        expect(resolveInsideVault(path, anchor.href ?? '')).toBe(targetPath);
        expect(anchor.rel).toBe(offset === 1 ? 'related' : 'references');
        expect(anchor.text).toBe(generatedNoteTitle(targetIndex));
      }
    }

    expect(ids.size).toBe(noteCount);
    expect(sqlitePaths).toEqual([generatedNotePath(NFR_SQLITE_NOTE_INDEX)]);
    expect(generatedNotePath(0)).toBe('notes/00/nota-0000.html');
    expect(generatedNotePath(99)).toBe('notes/00/nota-0099.html');
    expect(generatedNotePath(100)).toBe('notes/01/nota-0100.html');
    expect(generatedNotePath(999)).toBe('notes/09/nota-0999.html');
    if (noteCount === 5000) {
      expect(generatedNotePath(4999)).toBe('notes/49/nota-4999.html');
    }

    const first = byPath.get('notes/00/nota-0000.html');
    expect(first && inspectNote(first.contents).anchors.map((anchor) => anchor.href)).toEqual([
      'nota-0001.html',
      'nota-0010.html',
    ]);
    const last = byPath.get(generatedNotePath(noteCount - 1));
    if (last === undefined) {
      throw new Error('missing last note');
    }
    expect(inspectNote(last.contents).anchors.map((anchor) => anchor.href)).toEqual([
      '../00/nota-0000.html',
      '../00/nota-0009.html',
    ]);
  });
});

describe('writeVault', () => {
  it('writes a generated vault and reads the same bytes back', () => {
    const dir = tempDir();
    const files = generateVault({ noteCount: 1000, seed: NFR_SEED });
    writeVault(dir, files);
    for (const file of files) {
      expect(readFileSync(join(dir, file.path), 'utf8')).toBe(file.contents);
    }
  });

  it('refuses paths that escape the destination', () => {
    const dir = tempDir();
    for (const path of [
      '../outside.html',
      '/etc/passwd',
      'foo/../../outside.html',
      '.gaveta/../outside.html',
      'foo//bar.html',
      'foo/./bar.html',
      'foo\\bar.html',
    ]) {
      expect(() => {
        writeVault(dir, [{ path, contents: 'nope' }]);
      }, path).toThrow(/unsafe path/);
    }
    expect(existsSync(join(dir, 'outside.html'))).toBe(false);
  });

  it('refuses to follow a symlink out of the vault', () => {
    const dir = tempDir();
    const outside = tempDir();
    symlinkSync(outside, join(dir, 'out'));
    expect(() => {
      writeVault(dir, [{ path: 'out/note.html', contents: 'escaped' }]);
    }).toThrow(/symlink/);
    expect(existsSync(join(outside, 'note.html'))).toBe(false);

    const secret = join(dir, 'secret.txt');
    writeFileSync(secret, 'keep');
    symlinkSync(secret, join(dir, 'link.html'));
    expect(() => {
      writeVault(dir, [{ path: 'link.html', contents: 'replaced' }]);
    }).toThrow(/symlink/);
    expect(readFileSync(secret, 'utf8')).toBe('keep');

    const linkedRoot = join(tempDir(), 'linked-root');
    symlinkSync(dir, linkedRoot);
    expect(() => {
      writeVault(linkedRoot, [{ path: 'note.html', contents: 'nope' }]);
    }).toThrow(/symlink/);
  });

  it('refuses a destination that is not a directory', () => {
    const dir = tempDir();
    const file = join(dir, 'file.txt');
    writeFileSync(file, 'x');
    expect(() => {
      writeVault(file, [{ path: 'note.html', contents: 'nope' }]);
    }).toThrow(/directory/);
  });
});
