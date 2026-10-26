/**
 * PRD success metrics from the vault index and optional `.gaveta/log.jsonl`.
 */
import { realpath } from 'node:fs/promises';
import { GavetaError } from './errors.ts';
import type { IndexedLink, IndexedNote, VaultIndex } from './sqlite/store.ts';
import { openVaultIndex } from './sqlite/store.ts';
import { type CommandLogEntry, readCommandLog } from './vault/command-log.ts';

export interface VaultCatalog {
  readonly notes: readonly IndexedNote[];
  readonly links: readonly IndexedLink[];
  readonly byId: ReadonlyMap<string, readonly IndexedNote[]>;
}

export interface VaultIndexStats {
  readonly notes: number;
  readonly connectedNotes: number;
  readonly connectedNoteRate: number | null;
  readonly orphanNotes: number;
  readonly orphanNoteRate: number | null;
  readonly brokenLinks: number;
  readonly pendingLinks: number;
  readonly averageOutgoingLinksPerNote: number | null;
}

export interface VaultLogStats {
  readonly present: boolean;
  readonly commandEntries: number;
  readonly commandSuccessRate: number | null;
  readonly validationErrorsPerNoteCreated: number | null;
  readonly averageOutgoingLinksPerNoteCreated: number | null;
  readonly cliDurationP95Ms: number | null;
  readonly activeDaysLast7: number;
}

export interface VaultStats {
  readonly index: VaultIndexStats;
  readonly log: VaultLogStats;
}

export interface ComputeVaultStatsOptions {
  readonly now?: string;
}

export interface ComputeLogStatsOptions {
  readonly now?: string;
}

export function buildVaultCatalog(index: VaultIndex): VaultCatalog {
  const notes = index.notes();
  const links = index.links();
  const byId = new Map<string, IndexedNote[]>();
  for (const note of notes) {
    if (note.id === null) {
      continue;
    }
    const existing = byId.get(note.id);
    if (existing === undefined) {
      byId.set(note.id, [note]);
    } else {
      existing.push(note);
    }
  }
  return { notes, links, byId };
}

function noteHasOutgoing(link: IndexedLink): boolean {
  return (
    link.kind === 'canonical' ||
    link.kind === 'pending' ||
    link.kind === 'wikilink' ||
    (link.ghost && link.pendingTitle !== null)
  );
}

function countOrphanNotes(catalog: VaultCatalog): number {
  const referenced = new Set<string>();
  for (const link of catalog.links) {
    if (link.kind !== 'canonical' || link.targetId === null) {
      continue;
    }
    const matches = catalog.byId.get(link.targetId) ?? [];
    if (matches.length === 1) {
      referenced.add(link.targetId);
    }
  }
  let orphans = 0;
  for (const note of catalog.notes) {
    if (note.id === null) {
      continue;
    }
    const outgoing = catalog.links.some((link) => link.path === note.path && noteHasOutgoing(link));
    if (!outgoing && !referenced.has(note.id)) {
      orphans += 1;
    }
  }
  return orphans;
}

function countBrokenLinks(catalog: VaultCatalog): number {
  let broken = 0;
  for (const link of catalog.links) {
    if (link.kind !== 'canonical' || link.targetId === null) {
      continue;
    }
    const matches = catalog.byId.get(link.targetId) ?? [];
    if (matches.length === 0) {
      broken += 1;
    }
  }
  return broken;
}

function countPendingLinks(catalog: VaultCatalog): number {
  return catalog.links.filter(
    (link) => link.kind === 'pending' || (link.ghost && link.pendingTitle !== null),
  ).length;
}

function averageOutgoingLinksPerNote(catalog: VaultCatalog): number | null {
  const withId = catalog.notes.filter((note) => note.id !== null);
  if (withId.length === 0) {
    return null;
  }
  let total = 0;
  for (const note of withId) {
    total += catalog.links.filter(
      (link) => link.path === note.path && noteHasOutgoing(link),
    ).length;
  }
  return total / withId.length;
}

export function computeIndexStats(catalog: VaultCatalog): VaultIndexStats {
  const notes = catalog.notes.filter((note) => note.id !== null).length;
  const orphanNotes = countOrphanNotes(catalog);
  const connectedNotes = Math.max(0, notes - orphanNotes);
  return {
    notes,
    connectedNotes,
    connectedNoteRate: notes === 0 ? null : connectedNotes / notes,
    orphanNotes,
    orphanNoteRate: notes === 0 ? null : orphanNotes / notes,
    brokenLinks: countBrokenLinks(catalog),
    pendingLinks: countPendingLinks(catalog),
    averageOutgoingLinksPerNote: averageOutgoingLinksPerNote(catalog),
  };
}

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? null;
}

function utcDay(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

export function computeLogStats(
  entries: readonly CommandLogEntry[],
  options: ComputeLogStatsOptions = {},
): VaultLogStats {
  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  const windowStart = nowMs - 7 * 24 * 60 * 60 * 1000;
  const activeDays = new Set<string>();
  for (const entry of entries) {
    const day = utcDay(entry.ts);
    const ts = Date.parse(entry.ts);
    if (day !== null && !Number.isNaN(ts) && ts >= windowStart && ts <= nowMs) {
      activeDays.add(day);
    }
  }

  const successes = entries.filter((entry) => entry.ok).length;
  const commandSuccessRate = entries.length === 0 ? null : successes / entries.length;

  const newSuccesses = entries.filter((entry) => entry.command === 'new' && entry.ok);
  const newAttempts = entries.filter((entry) => entry.command === 'new');
  const validationErrors = newAttempts.reduce(
    (sum, entry) => sum + (entry.validationErrors ?? 0),
    0,
  );
  const validationErrorsPerNoteCreated =
    newAttempts.length === 0 ? null : validationErrors / newAttempts.length;

  const outgoingSamples = newSuccesses
    .map((entry) => entry.outgoingLinks)
    .filter((value): value is number => value !== undefined);
  const averageOutgoingLinksPerNoteCreated =
    outgoingSamples.length === 0
      ? null
      : outgoingSamples.reduce((sum, value) => sum + value, 0) / outgoingSamples.length;

  const durations = entries
    .map((entry) => entry.durationMs)
    .filter((value): value is number => value !== undefined);

  return {
    present: true,
    commandEntries: entries.length,
    commandSuccessRate,
    validationErrorsPerNoteCreated,
    averageOutgoingLinksPerNoteCreated,
    cliDurationP95Ms: percentile95(durations),
    activeDaysLast7: activeDays.size,
  };
}

function emptyLogStats(): VaultLogStats {
  return {
    present: false,
    commandEntries: 0,
    commandSuccessRate: null,
    validationErrorsPerNoteCreated: null,
    averageOutgoingLinksPerNoteCreated: null,
    cliDurationP95Ms: null,
    activeDaysLast7: 0,
  };
}

export async function computeVaultStats(
  vaultRoot: string,
  options: ComputeVaultStatsOptions = {},
): Promise<VaultStats> {
  if (typeof vaultRoot !== 'string' || vaultRoot.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const root = await realpath(vaultRoot);
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    const catalog = buildVaultCatalog(index);
    const indexStats = computeIndexStats(catalog);
    const logEntries = await readCommandLog(root);
    const logStats = logEntries === null ? emptyLogStats() : computeLogStats(logEntries, options);
    return { index: indexStats, log: logStats };
  } finally {
    index.close();
  }
}
