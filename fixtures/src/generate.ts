import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, sep } from 'node:path';
import { CREATED } from './constants.ts';
import { themeHrefFor, vaultPath } from './paths.ts';
import { slugify } from './slug.ts';
import { noteUlid } from './ulid.ts';

export const NFR_NOTE_COUNTS = [1000, 5000] as const;

export type NfrNoteCount = (typeof NFR_NOTE_COUNTS)[number];

/** Canonical seed for the REQ-NFR vaults. Same seed, same bytes. */
export const NFR_SEED = 1;

/** Index of the generated note whose body contains the word `sqlite`. */
export const NFR_SQLITE_NOTE_INDEX = 42;

const LINK_OFFSETS = [1, 10] as const;

export interface GenerateVaultOptions {
  noteCount: number;
  seed: number;
}

export interface GeneratedFile {
  path: string;
  contents: string;
}

function assertOptions(options: GenerateVaultOptions): void {
  if (options.noteCount !== 1000 && options.noteCount !== 5000) {
    throw new Error('noteCount must be 1000 or 5000');
  }
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xff_ff_ff_ff) {
    throw new Error('seed must be an integer from 0 to 4294967295');
  }
}

function assertSafeRelative(relativePath: string): void {
  if (relativePath.startsWith('/') || relativePath.includes('\\')) {
    throw new Error(`Refusing to write unsafe path: ${relativePath}`);
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Refusing to write unsafe path: ${relativePath}`);
  }
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

export function generatedNotePath(index: number): string {
  const bucket = String(Math.floor(index / 100)).padStart(2, '0');
  const title = generatedNoteTitle(index);
  return `notes/${bucket}/${slugify(title)}.html`;
}

export function generatedNoteTitle(index: number): string {
  return `Nota ${String(index).padStart(4, '0')}`;
}

function relativeHref(fromPath: string, toPath: string): string {
  return posix.relative(posix.dirname(fromPath), toPath);
}

function paragraph(index: number): string {
  const base = `Nota generada ${String(index).padStart(4, '0')} del vault de rendimiento.`;
  if (index === NFR_SQLITE_NOTE_INDEX) {
    return `${base} El índice usa sqlite.`;
  }
  return base;
}

function renderNote(
  index: number,
  seed: number,
  noteCount: number,
): { path: string; contents: string } {
  const path = generatedNotePath(index);
  const title = generatedNoteTitle(index);
  const id = noteUlid(seed, index);
  const links = LINK_OFFSETS.map((offset) => {
    const targetIndex = (index + offset) % noteCount;
    const targetPath = generatedNotePath(targetIndex);
    return {
      href: relativeHref(path, targetPath),
      id: noteUlid(seed, targetIndex),
      title: generatedNoteTitle(targetIndex),
      rel: offset === 1 ? 'related' : 'references',
    };
  });
  const [first, second] = links;
  if (first === undefined || second === undefined) {
    throw new Error('generated note is missing its links');
  }
  const contents = [
    '<!doctype html>',
    '<html lang="es">',
    '  <head>',
    '    <meta charset="utf-8" />',
    `    <title>${escapeText(title)}</title>`,
    `    <meta name="gaveta:id" content="${escapeAttr(id)}" />`,
    '    <meta name="gaveta:type" content="doc" />',
    '    <meta name="gaveta:tags" content="nfr" />',
    `    <meta name="gaveta:created" content="${CREATED}" />`,
    `    <link rel="stylesheet" href="${escapeAttr(themeHrefFor(path))}" />`,
    '  </head>',
    '  <body>',
    '    <article>',
    `      <h1>${escapeText(title)}</h1>`,
    '      <section id="cuerpo">',
    '        <h2>Cuerpo</h2>',
    `        <p>${escapeText(paragraph(index))}</p>`,
    '        <p>',
    `          <a href="${escapeAttr(first.href)}" data-g-to="${escapeAttr(first.id)}" rel="${first.rel}">${escapeText(first.title)}</a>`,
    `          <a href="${escapeAttr(second.href)}" data-g-to="${escapeAttr(second.id)}" rel="${second.rel}">${escapeText(second.title)}</a>`,
    '        </p>',
    '      </section>',
    '    </article>',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
  return { path, contents };
}

function byPath(left: GeneratedFile, right: GeneratedFile): number {
  if (left.path < right.path) {
    return -1;
  }
  if (left.path > right.path) {
    return 1;
  }
  return 0;
}

function readSkeleton(): GeneratedFile[] {
  const dir = join(vaultPath('empty'), '.gaveta');
  return [
    {
      path: '.gaveta/config.json',
      contents: readFileSync(join(dir, 'config.json'), 'utf8'),
    },
    {
      path: '.gaveta/theme.css',
      contents: readFileSync(join(dir, 'theme.css'), 'utf8'),
    },
  ];
}

/**
 * Build a vault of `noteCount` valid `doc` notes.
 * Bytes depend only on `noteCount`, `seed`, and the empty-vault skeleton.
 */
export function generateVault(options: GenerateVaultOptions): GeneratedFile[] {
  assertOptions(options);
  const files = readSkeleton();
  for (let index = 0; index < options.noteCount; index += 1) {
    files.push(renderNote(index, options.seed, options.noteCount));
  }
  files.sort(byPath);
  for (let index = 1; index < files.length; index += 1) {
    const previous = files[index - 1];
    const current = files[index];
    if (previous?.path !== undefined && previous.path === current?.path) {
      throw new Error(`duplicate path: ${previous.path}`);
    }
  }
  return files;
}

function refuseSymlink(path: string, relativePath: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new Error(`Refusing to follow symlink: ${relativePath}`);
  }
}

function placeFile(root: string, relativePath: string): string {
  assertSafeRelative(relativePath);
  const segments = relativePath.split('/');
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      throw new Error(`Refusing to write unsafe path: ${relativePath}`);
    }
    current = join(current, segment);
    const isLast = index === segments.length - 1;
    refuseSymlink(current, relativePath);
    if (!existsSync(current)) {
      if (!isLast) {
        mkdirSync(current);
      }
      continue;
    }
    const stat = lstatSync(current);
    if (isLast) {
      if (!stat.isFile()) {
        throw new Error(`Refusing to overwrite a non-file: ${relativePath}`);
      }
      continue;
    }
    if (!stat.isDirectory()) {
      throw new Error(`Refusing to write through a non-directory: ${relativePath}`);
    }
  }
  const parent = realpathSync(dirname(current));
  const fromRoot = relative(root, parent);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`Refusing to write outside the vault: ${relativePath}`);
  }
  return current;
}

/** Write `files` under `destination`. Relative paths may not escape or follow a symlink. */
export function writeVault(destination: string, files: readonly GeneratedFile[]): void {
  if (existsSync(destination)) {
    const existing = lstatSync(destination);
    if (existing.isSymbolicLink()) {
      throw new Error('Refusing to write through a symlinked vault directory');
    }
    if (!existing.isDirectory()) {
      throw new Error('Vault destination is not a directory');
    }
  } else {
    mkdirSync(destination, { recursive: true });
  }
  const root = realpathSync(destination);
  for (const file of files) {
    if (typeof file.path !== 'string' || typeof file.contents !== 'string') {
      throw new Error('each generated file needs a string path and contents');
    }
    const target = placeFile(root, file.path);
    writeFileSync(target, file.contents, { encoding: 'utf8' });
  }
}
