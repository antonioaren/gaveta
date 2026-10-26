import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import { pathOutsideVault } from './errors.ts';
import { hasNodeErrorCode } from './node-error.ts';
import { isInsideVault, readVaultText } from './paths.ts';

export const COMMAND_LOG_RELATIVE = `${GAVETA_DIRECTORY}/log.jsonl`;

const MAX_LOG_LINE_CHARS = 8192;

export interface CommandLogEntry {
  readonly ts: string;
  readonly command: string;
  readonly ok: boolean;
  readonly durationMs?: number;
  readonly validationErrors?: number;
  readonly outgoingLinks?: number;
}

export async function readCommandLog(vaultRoot: string): Promise<CommandLogEntry[] | null> {
  const absolute = path.join(vaultRoot, ...COMMAND_LOG_RELATIVE.split('/'));
  if (!isInsideVault(vaultRoot, absolute)) {
    throw pathOutsideVault();
  }
  const listed = await lstatOrNull(absolute);
  if (listed === null) {
    return null;
  }
  if (listed.isSymbolicLink()) {
    throw pathOutsideVault();
  }
  if (!listed.isFile()) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const text = await readVaultText(vaultRoot, COMMAND_LOG_RELATIVE);
  const entries: CommandLogEntry[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.length > MAX_LOG_LINE_CHARS) {
      continue;
    }
    const parsed = parseCommandLogLine(trimmed);
    if (parsed !== null) {
      entries.push(parsed);
    }
  }
  return entries;
}

export function parseCommandLogLine(line: string): CommandLogEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const ts = record.ts;
  const command = record.command;
  const ok = record.ok;
  if (typeof ts !== 'string' || typeof command !== 'string' || typeof ok !== 'boolean') {
    return null;
  }
  if (ts.length === 0 || command.length === 0) {
    return null;
  }
  let durationMs: number | undefined;
  if (record.durationMs !== undefined) {
    if (
      typeof record.durationMs !== 'number' ||
      !Number.isFinite(record.durationMs) ||
      record.durationMs < 0
    ) {
      return null;
    }
    durationMs = record.durationMs;
  }
  let validationErrors: number | undefined;
  if (record.validationErrors !== undefined) {
    if (
      typeof record.validationErrors !== 'number' ||
      !Number.isInteger(record.validationErrors) ||
      record.validationErrors < 0
    ) {
      return null;
    }
    validationErrors = record.validationErrors;
  }
  let outgoingLinks: number | undefined;
  if (record.outgoingLinks !== undefined) {
    if (
      typeof record.outgoingLinks !== 'number' ||
      !Number.isInteger(record.outgoingLinks) ||
      record.outgoingLinks < 0
    ) {
      return null;
    }
    outgoingLinks = record.outgoingLinks;
  }
  return {
    ts,
    command,
    ok,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(validationErrors === undefined ? {} : { validationErrors }),
    ...(outgoingLinks === undefined ? {} : { outgoingLinks }),
  };
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}
