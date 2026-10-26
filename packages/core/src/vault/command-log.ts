import { constants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import type { VaultConfig } from './config.ts';
import { readVaultConfig } from './config.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import { pathOutsideVault } from './errors.ts';
import { hasNodeErrorCode } from './node-error.ts';
import { isInsideVault, readVaultText } from './paths.ts';
import { writeAtomic } from './atomic.ts';

export const COMMAND_LOG_RELATIVE = `${GAVETA_DIRECTORY}/log.jsonl`;

const MAX_LOG_LINE_CHARS = 8192;
const MAX_LOG_BYTES = 200 * 1024;
const ROTATE_KEEP_LINES = 500;
const MAX_COMMAND_NAME_CHARS = 64;
const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9 -]*$/;

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

export function isCommandLogEnabled(config: VaultConfig): boolean {
  return config.commandLog?.enabled === true;
}

export type CommandLogWriteEntry = CommandLogEntry;

export async function appendCommandLogEntry(
  vaultRoot: string,
  entry: CommandLogWriteEntry,
): Promise<boolean> {
  try {
    const config = await readVaultConfig(vaultRoot);
    if (!isCommandLogEnabled(config)) {
      return false;
    }
    const line = serializeCommandLogLine(entry);
    if (line === null) {
      return false;
    }
    const absolute = path.join(vaultRoot, ...COMMAND_LOG_RELATIVE.split('/'));
    if (!isInsideVault(vaultRoot, absolute)) {
      return false;
    }
    const listed = await lstatOrNull(absolute);
    if (listed !== null) {
      if (listed.isSymbolicLink()) {
        return false;
      }
      if (!listed.isFile()) {
        return false;
      }
      if (Number(listed.size) + line.length > MAX_LOG_BYTES) {
        await rotateCommandLog(absolute);
      }
    }
    const handle = await open(
      absolute,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY,
      0o644,
    );
    try {
      await handle.writeFile(line, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  } catch {
    return false;
  }
}

function serializeCommandLogLine(entry: CommandLogWriteEntry): string | null {
  if (!isValidCommandName(entry.command)) {
    return null;
  }
  if (entry.ts.length === 0 || entry.ts.length > 64) {
    return null;
  }
  const body: Record<string, unknown> = {
    ts: entry.ts,
    command: entry.command,
    ok: entry.ok,
  };
  if (entry.durationMs !== undefined) {
    if (!Number.isFinite(entry.durationMs) || entry.durationMs < 0) {
      return null;
    }
    body.durationMs = Math.round(entry.durationMs);
  }
  if (entry.validationErrors !== undefined) {
    if (!Number.isInteger(entry.validationErrors) || entry.validationErrors < 0) {
      return null;
    }
    body.validationErrors = entry.validationErrors;
  }
  if (entry.outgoingLinks !== undefined) {
    if (!Number.isInteger(entry.outgoingLinks) || entry.outgoingLinks < 0) {
      return null;
    }
    body.outgoingLinks = entry.outgoingLinks;
  }
  const serialized = `${JSON.stringify(body)}\n`;
  if (serialized.length > MAX_LOG_LINE_CHARS) {
    return null;
  }
  return serialized;
}

function isValidCommandName(command: string): boolean {
  return (
    command.length > 0 &&
    command.length <= MAX_COMMAND_NAME_CHARS &&
    COMMAND_NAME_PATTERN.test(command)
  );
}

async function rotateCommandLog(absolute: string): Promise<void> {
  const text = await readFile(absolute, 'utf8');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const kept = lines.slice(-ROTATE_KEEP_LINES);
  const next = kept.length === 0 ? '' : `${kept.join('\n')}\n`;
  await writeAtomic(absolute, next);
}
