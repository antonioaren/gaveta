import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { GavetaError } from '@gaveta/core';
import { API_IMPORT_SESSION_MAX_BYTES, API_IMPORT_SESSION_TTL_MS } from '../constants.ts';
import { assertSafeImportRelativePath } from './safe-relative-path.ts';

interface ImportStagingSession {
  readonly id: string;
  readonly rootDir: string;
  readonly createdAt: number;
  bytesUsed: number;
  readonly files: Set<string>;
  sourceRoot: string | null;
}

const sessions = new Map<string, ImportStagingSession>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > API_IMPORT_SESSION_TTL_MS) {
      sessions.delete(id);
      void rm(session.rootDir, { recursive: true, force: true });
    }
  }
}

export async function createImportStagingSession(): Promise<{ stagingId: string }> {
  purgeExpired();
  const rootDir = await mkdtemp(path.join(tmpdir(), 'gaveta-import-'));
  const id = randomUUID();
  sessions.set(id, {
    id,
    rootDir,
    createdAt: Date.now(),
    bytesUsed: 0,
    files: new Set(),
    sourceRoot: null,
  });
  return { stagingId: id };
}

function getSession(stagingId: string): ImportStagingSession {
  purgeExpired();
  const session = sessions.get(stagingId);
  if (session === undefined) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return session;
}

export async function writeImportStagingFile(
  stagingId: string,
  relativePath: string,
  data: Buffer,
): Promise<void> {
  const safePath = assertSafeImportRelativePath(relativePath);
  if (data.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const session = getSession(stagingId);
  const nextBytes = session.bytesUsed + data.length;
  if (nextBytes > API_IMPORT_SESSION_MAX_BYTES) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const absolute = path.join(session.rootDir, safePath);
  const parent = path.dirname(absolute);
  await mkdir(parent, { recursive: true });
  await writeFile(absolute, data);
  session.bytesUsed = nextBytes;
  session.files.add(safePath);
}

export function resolveImportStagingSource(
  stagingId: string,
  rootName: string | undefined,
): string {
  const session = getSession(stagingId);
  if (session.files.size === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (session.sourceRoot !== null) {
    return session.sourceRoot;
  }
  const mdFiles = [...session.files].filter((file) => file.toLowerCase().endsWith('.md'));
  if (mdFiles.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const trimmedRoot = rootName?.trim();
  if (trimmedRoot !== undefined && trimmedRoot.length > 0) {
    const safeRoot = assertSafeImportRelativePath(trimmedRoot);
    session.sourceRoot = path.join(session.rootDir, safeRoot);
    return session.sourceRoot;
  }
  const onlyMd = mdFiles[0];
  if (onlyMd !== undefined && mdFiles.length === 1 && !onlyMd.includes('/')) {
    session.sourceRoot = path.join(session.rootDir, onlyMd);
    return session.sourceRoot;
  }
  const commonPrefix = findCommonDirectoryPrefix(mdFiles);
  if (commonPrefix.length > 0) {
    session.sourceRoot = path.join(session.rootDir, commonPrefix);
    return session.sourceRoot;
  }
  session.sourceRoot = session.rootDir;
  return session.sourceRoot;
}

function findCommonDirectoryPrefix(paths: readonly string[]): string {
  if (paths.length === 0) {
    return '';
  }
  const split = paths.map((entry) => entry.split('/').slice(0, -1));
  const first = split[0];
  if (first === undefined) {
    return '';
  }
  const prefix: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    const segment = first[index];
    if (segment === undefined) {
      break;
    }
    const matches = split.every((parts) => parts[index] === segment);
    if (!matches) {
      break;
    }
    prefix.push(segment);
  }
  return prefix.join('/');
}

export async function disposeImportStagingSession(stagingId: string): Promise<void> {
  const session = sessions.get(stagingId);
  if (session === undefined) {
    return;
  }
  sessions.delete(stagingId);
  await rm(session.rootDir, { recursive: true, force: true });
}

export function resetImportStagingForTests(): void {
  for (const session of sessions.values()) {
    void rm(session.rootDir, { recursive: true, force: true });
  }
  sessions.clear();
}
