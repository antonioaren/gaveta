import { EXIT_CODES } from '@gaveta/core';
import type { CommandLogWriteEntry } from '@gaveta/core';
import type { CommandResult, CommandSpec, CommandSubSpec, CommandWarning } from './types.ts';

const SKIP_COMMANDS = new Set(['stats']);

export function commandLogLabel(spec: CommandSpec, subcommand: CommandSubSpec | undefined): string {
  const base = spec.name.toLowerCase();
  if (subcommand === undefined) {
    return base;
  }
  return `${base} ${subcommand.name.toLowerCase()}`;
}

export function shouldRecordCommandLog(spec: CommandSpec): boolean {
  return !SKIP_COMMANDS.has(spec.name);
}

export function buildCommandLogEntry(
  spec: CommandSpec,
  subcommand: CommandSubSpec | undefined,
  result: CommandResult | null,
  exitCode: number,
  durationMs: number,
): CommandLogWriteEntry {
  const ok = exitCode === EXIT_CODES.ok;
  const entry: CommandLogWriteEntry = {
    ts: new Date().toISOString(),
    command: commandLogLabel(spec, subcommand),
    ok,
    durationMs: Math.max(0, Math.round(durationMs)),
  };
  if (spec.name !== 'new') {
    return entry;
  }
  if (ok && result !== null && isCreatedNoteData(result.data)) {
    return {
      ...entry,
      outgoingLinks: result.data.links.resolved.length + result.data.links.pending.length,
    };
  }
  const validationErrors = countValidationErrors(result?.warnings ?? []);
  if (validationErrors > 0) {
    return { ...entry, validationErrors };
  }
  return entry;
}

function countValidationErrors(warnings: readonly CommandWarning[]): number {
  return warnings.length;
}

function isCreatedNoteData(
  data: unknown,
): data is { links: { resolved: readonly unknown[]; pending: readonly unknown[] } } {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const links = (data as { links?: unknown }).links;
  if (typeof links !== 'object' || links === null) {
    return false;
  }
  const record = links as { resolved?: unknown; pending?: unknown };
  return Array.isArray(record.resolved) && Array.isArray(record.pending);
}
