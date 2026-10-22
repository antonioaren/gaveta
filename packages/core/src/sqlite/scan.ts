import { lstat, opendir, realpath, stat } from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import path from 'node:path';
import { formatDiagnostic, type DiagnosticCode } from '../errors.ts';
import { GAVETA_DIRECTORY } from '../vault/constants.ts';
import { hasNodeErrorCode } from '../vault/node-error.ts';
import { isInsideVault } from '../vault/paths.ts';

export interface ScannedFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly symlink: boolean;
  readonly mtimeMs: number;
}

export interface ScanProblem {
  readonly path: string;
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly hint: string;
  readonly details: Readonly<Record<string, string | number>> | null;
}

export interface ScannedVault {
  readonly files: readonly ScannedFile[];
  readonly problems: readonly ScanProblem[];
}

/**
 * List `.html` notes under the vault. `.gaveta` is skipped.
 * A symlink is followed only when its target stays inside the vault; otherwise it is reported
 * and not read.
 */
export async function scanNoteFiles(vaultRoot: string): Promise<ScannedVault> {
  const root = await realpath(vaultRoot);
  const files: ScannedFile[] = [];
  const problems: ScanProblem[] = [];
  const visited = new Set<string>();
  await walkDirectory(root, root, '', visited, files, problems);
  files.sort((left, right) => comparePath(left.relativePath, right.relativePath));
  problems.sort((left, right) => comparePath(left.path, right.path));
  return { files, problems };
}

async function walkDirectory(
  root: string,
  directory: string,
  relativeDir: string,
  visited: Set<string>,
  files: ScannedFile[],
  problems: ScanProblem[],
): Promise<void> {
  let realDirectory: string;
  try {
    realDirectory = await realpath(directory);
  } catch {
    problems.push(outsideProblem(relativeDir.length === 0 ? '.' : relativeDir));
    return;
  }
  if (!isInsideVault(root, realDirectory) || visited.has(realDirectory)) {
    if (!isInsideVault(root, realDirectory)) {
      problems.push(outsideProblem(relativeDir.length === 0 ? '.' : relativeDir));
    }
    return;
  }
  visited.add(realDirectory);

  let dir;
  try {
    dir = await opendir(directory);
  } catch {
    problems.push(outsideProblem(relativeDir.length === 0 ? '.' : relativeDir));
    return;
  }
  try {
    for (;;) {
      const entry = await dir.read();
      if (entry === null) {
        break;
      }
      await visitEntry(root, directory, relativeDir, entry, visited, files, problems);
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
  files: ScannedFile[],
  problems: ScanProblem[],
): Promise<void> {
  if (
    entry.name.length === 0 ||
    entry.name === '.' ||
    entry.name === '..' ||
    entry.name.includes('\0')
  ) {
    return;
  }
  if (entry.name === GAVETA_DIRECTORY) {
    return;
  }
  const relativePath = relativeDir.length === 0 ? entry.name : `${relativeDir}/${entry.name}`;
  const absolutePath = path.join(directory, entry.name);
  let listed: Stats;
  try {
    listed = await lstat(absolutePath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return;
    }
    problems.push(outsideProblem(relativePath));
    return;
  }
  if (listed.isSymbolicLink()) {
    await visitSymlink(root, absolutePath, relativePath, visited, files, problems);
    return;
  }
  if (listed.isDirectory()) {
    await walkDirectory(root, absolutePath, relativePath, visited, files, problems);
    return;
  }
  if (listed.isFile() && isHtmlName(entry.name)) {
    files.push({
      relativePath,
      absolutePath,
      symlink: false,
      mtimeMs: Math.round(listed.mtimeMs),
    });
  }
}

async function visitSymlink(
  root: string,
  absolutePath: string,
  relativePath: string,
  visited: Set<string>,
  files: ScannedFile[],
  problems: ScanProblem[],
): Promise<void> {
  let target: string;
  try {
    target = await realpath(absolutePath);
  } catch {
    problems.push(outsideProblem(relativePath));
    return;
  }
  if (!isInsideVault(root, target)) {
    problems.push(outsideProblem(relativePath));
    return;
  }
  let targetStat: Stats;
  try {
    targetStat = await stat(target);
  } catch {
    problems.push(outsideProblem(relativePath));
    return;
  }
  if (targetStat.isDirectory()) {
    await walkDirectory(root, absolutePath, relativePath, visited, files, problems);
    return;
  }
  if (targetStat.isFile() && isHtmlName(relativePath)) {
    files.push({
      relativePath,
      absolutePath,
      symlink: true,
      mtimeMs: Math.round(targetStat.mtimeMs),
    });
  }
}

function isHtmlName(name: string): boolean {
  return name.endsWith('.html');
}

function outsideProblem(relativePath: string): ScanProblem {
  const text = formatDiagnostic('E_PATH_OUTSIDE_VAULT');
  return {
    path: relativePath,
    code: 'E_PATH_OUTSIDE_VAULT',
    message: text.message,
    hint: text.hint,
    details: { reason: 'symlink' },
  };
}

function comparePath(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
