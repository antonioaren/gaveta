import { DatabaseSync } from 'node:sqlite';
import { GavetaError } from './errors.ts';
import { silenceSqliteExperimentalWarning } from './sqlite/warning.ts';

/** Minimum Node for default type stripping and FTS5 on macOS builds we support. */
export const MIN_SUPPORTED_NODE = '22.18.0';

export interface RuntimeProbe {
  readonly nodeVersion?: string;
  readonly minimum?: string;
  readonly fts5?: () => boolean;
}

export function parseNodeVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) {
    return [0, 0, 0];
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNodeVersionAtLeast(actual: string, minimum: string): boolean {
  const [aMajor, aMinor, aPatch] = parseNodeVersion(actual);
  const [mMajor, mMinor, mPatch] = parseNodeVersion(minimum);
  if (aMajor !== mMajor) {
    return aMajor > mMajor;
  }
  if (aMinor !== mMinor) {
    return aMinor > mMinor;
  }
  return aPatch >= mPatch;
}

export function sqliteIndicatesMissingFts5(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes('no such module: fts5');
}

export function probeFts5(): boolean {
  silenceSqliteExperimentalWarning();
  try {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec('CREATE VIRTUAL TABLE probe USING fts5(content)');
      return true;
    } finally {
      database.close();
    }
  } catch (error) {
    if (sqliteIndicatesMissingFts5(error)) {
      return false;
    }
    throw error;
  }
}

export function assertRuntimeSupported(options: RuntimeProbe = {}): void {
  const version = options.nodeVersion ?? process.versions.node;
  const minimum = options.minimum ?? MIN_SUPPORTED_NODE;
  const fts5 = options.fts5 ?? probeFts5;
  if (!isNodeVersionAtLeast(version, minimum) || !fts5()) {
    throw new GavetaError('E_RUNTIME_UNSUPPORTED', { version, minimum });
  }
}

export function runtimeUnsupportedFromSqlite(error: unknown): GavetaError | null {
  if (!sqliteIndicatesMissingFts5(error)) {
    return null;
  }
  return new GavetaError('E_RUNTIME_UNSUPPORTED', {
    version: process.versions.node,
    minimum: MIN_SUPPORTED_NODE,
  });
}
