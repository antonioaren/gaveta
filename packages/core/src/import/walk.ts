import { lstat, opendir, readFile, realpath } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import { hasNodeErrorCode } from '../vault/node-error.ts';
import { mergeExcludePatterns, shouldExcludeImportPath } from './exclude.ts';

export interface WalkedMarkdownFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly markdown: string;
}

export async function walkMarkdownFolder(
  sourceRoot: string,
  exclude: readonly string[] | undefined,
): Promise<WalkedMarkdownFile[]> {
  if (typeof sourceRoot !== 'string' || sourceRoot.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const root = await realpath(sourceRoot);
  const patterns = mergeExcludePatterns(exclude);
  const files: WalkedMarkdownFile[] = [];
  const visited = new Set<string>();
  await walkDir(root, root, '', visited, patterns, files);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}

async function walkDir(
  root: string,
  directory: string,
  relativeDir: string,
  visited: Set<string>,
  patterns: readonly string[],
  files: WalkedMarkdownFile[],
): Promise<void> {
  let realDirectory: string;
  try {
    realDirectory = await realpath(directory);
  } catch {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  if (!isInside(root, realDirectory) || visited.has(realDirectory)) {
    if (!isInside(root, realDirectory)) {
      throw new GavetaError('E_PATH_OUTSIDE_VAULT');
    }
    return;
  }
  visited.add(realDirectory);

  let dir;
  try {
    dir = await opendir(directory);
  } catch {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  try {
    for (;;) {
      const entry = await dir.read();
      if (entry === null) {
        break;
      }
      await visitEntry(root, directory, relativeDir, entry, visited, patterns, files);
    }
  } finally {
    await dir.close();
  }
}

async function visitEntry(
  root: string,
  directory: string,
  relativeDir: string,
  entry: Dirent,
  visited: Set<string>,
  patterns: readonly string[],
  files: WalkedMarkdownFile[],
): Promise<void> {
  if (
    entry.name.length === 0 ||
    entry.name === '.' ||
    entry.name === '..' ||
    entry.name.includes('\0')
  ) {
    return;
  }
  const relativePath = relativeDir.length === 0 ? entry.name : `${relativeDir}/${entry.name}`;
  if (shouldExcludeImportPath(relativePath, patterns)) {
    return;
  }
  const absolutePath = path.join(directory, entry.name);
  let listed;
  try {
    listed = await lstat(absolutePath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  if (listed.isSymbolicLink()) {
    const target = await realpath(absolutePath);
    if (!isInside(root, target)) {
      throw new GavetaError('E_PATH_OUTSIDE_VAULT');
    }
    if (listed.isDirectory()) {
      await walkDir(root, target, relativePath, visited, patterns, files);
      return;
    }
    if (entry.name.toLowerCase().endsWith('.md') && entry.name !== 'README.md') {
      const markdown = await readFile(target, 'utf8');
      files.push({ relativePath, absolutePath: target, markdown });
    }
    return;
  }
  if (listed.isDirectory()) {
    await walkDir(root, absolutePath, relativePath, visited, patterns, files);
    return;
  }
  if (!listed.isFile()) {
    return;
  }
  if (!entry.name.toLowerCase().endsWith('.md') || entry.name === 'README.md') {
    return;
  }
  const markdown = await readFile(absolutePath, 'utf8');
  files.push({ relativePath, absolutePath, markdown });
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative.length === 0 || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
