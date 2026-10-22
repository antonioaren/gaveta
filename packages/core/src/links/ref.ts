import { isUlid } from '../contract.ts';
import { GavetaError, type ErrorCode } from '../errors.ts';
import type { SourceLocation } from '../parser.ts';
import type { IndexedNote, VaultIndex } from '../sqlite/store.ts';
import { linkDiagnostic } from './diagnostic.ts';
import { comparePath, inspectVaultPath } from './path.ts';
import { suggestNotes } from './suggest.ts';
import type { LinkDiagnostic, NoteRef, ResolvedRef } from './types.ts';

/**
 * A ref error that carries `details` for the JSON envelope.
 * `candidates` and `suggestions` use `{ id, title, path }`.
 */
export class GavetaRefError extends GavetaError {
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    params: Readonly<Record<string, string | number>>,
    details: Readonly<Record<string, unknown>>,
  ) {
    super(code, params);
    this.name = 'GavetaRefError';
    this.details = details;
  }
}

export type TitleMatch =
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly note: IndexedNote; readonly via: 'title' | 'alias' }
  | { readonly kind: 'many'; readonly notes: readonly IndexedNote[] };

/**
 * Resolve a CLI ref: id, then vault path, then title or alias.
 * Title and alias matches ignore case and accents. An ambiguous title throws
 * `E_REF_AMBIGUOUS` with `details.candidates`. A miss throws `E_REF_NOT_FOUND`
 * with `details.suggestions`.
 */
export function resolveRef(index: VaultIndex, ref: string): ResolvedRef {
  if (typeof ref !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const inspected = inspectVaultPath(trimmed);
  if (!inspected.ok) {
    throw pathFailure(inspected.reason);
  }
  if (isUlid(trimmed)) {
    const matches = notesForId(index, trimmed);
    if (matches.length === 1) {
      const note = matches[0];
      if (note !== undefined) {
        return toResolved(note, 'id');
      }
    } else if (matches.length > 1) {
      throw ambiguous(matches);
    }
  }
  const byPath = index.note(inspected.path);
  if (byPath !== null) {
    return toResolved(byPath, 'path');
  }
  const titled = lookupTitle(index, trimmed, inspected.path);
  if (titled.kind === 'one') {
    return toResolved(titled.note, titled.via);
  }
  if (titled.kind === 'many') {
    throw ambiguous(titled.notes);
  }
  throw notFound(index, trimmed);
}

/**
 * Title or alias only. Wikilinks and pending promotion use this, not `resolveRef`,
 * so a title is never treated as an id or a vault path.
 */
export function resolveTitle(index: VaultIndex, title: string): ResolvedRef {
  if (typeof title !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const match = matchTitle(index, trimmed);
  if (match.kind === 'one') {
    return toResolved(match.note, match.via);
  }
  if (match.kind === 'many') {
    throw ambiguous(match.notes);
  }
  throw notFound(index, trimmed);
}

export function matchTitle(index: VaultIndex, title: string): TitleMatch {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { kind: 'none' };
  }
  const found = new Map<string, { note: IndexedNote; via: 'title' | 'alias' }>();
  for (const note of index.notesMatchingTitle(trimmed)) {
    found.set(note.path, { note, via: 'title' });
  }
  for (const notePath of index.pathsMatchingAlias(trimmed)) {
    if (found.has(notePath)) {
      continue;
    }
    const note = index.note(notePath);
    if (note === null) {
      continue;
    }
    found.set(notePath, { note, via: 'alias' });
  }
  const matches = [...found.values()].sort((left, right) =>
    comparePath(left.note.path, right.note.path),
  );
  if (matches.length === 0) {
    return { kind: 'none' };
  }
  const only = matches[0];
  if (matches.length === 1 && only !== undefined) {
    return { kind: 'one', note: only.note, via: only.via };
  }
  return { kind: 'many', notes: matches.map((item) => item.note) };
}

export function notesForId(index: VaultIndex, id: string): IndexedNote[] {
  const found = new Map<string, IndexedNote>();
  const variants = new Set<string>([id, id.toUpperCase(), id.toLowerCase()]);
  for (const variant of variants) {
    for (const note of index.notesById(variant)) {
      found.set(note.path, note);
    }
  }
  return [...found.values()].sort((left, right) => comparePath(left.path, right.path));
}

export function refCandidates(notes: readonly IndexedNote[]): NoteRef[] {
  return [...notes]
    .sort((left, right) => comparePath(left.path, right.path))
    .map((note) => toRef(note));
}

export function ambiguousDiagnostic(
  notes: readonly IndexedNote[],
  location: SourceLocation | null,
): LinkDiagnostic {
  return linkDiagnostic('E_REF_AMBIGUOUS', location, {}, { candidates: refCandidates(notes) });
}

function lookupTitle(index: VaultIndex, raw: string, normalized: string): TitleMatch {
  const direct = matchTitle(index, raw);
  if (direct.kind !== 'none' || normalized === raw) {
    return direct;
  }
  return matchTitle(index, normalized);
}

function toResolved(note: IndexedNote, matchedBy: ResolvedRef['matchedBy']): ResolvedRef {
  return { ...toRef(note), matchedBy };
}

function toRef(note: IndexedNote): NoteRef {
  return { id: note.id, title: note.title, path: note.path };
}

function ambiguous(notes: readonly IndexedNote[]): GavetaRefError {
  return new GavetaRefError('E_REF_AMBIGUOUS', {}, { candidates: refCandidates(notes) });
}

function notFound(index: VaultIndex, query: string): GavetaRefError {
  return new GavetaRefError('E_REF_NOT_FOUND', {}, { suggestions: suggestNotes(index, query) });
}

function pathFailure(reason: 'outside' | 'unsafe-url' | 'empty'): GavetaError {
  if (reason === 'unsafe-url') {
    return new GavetaError('E_UNSAFE_URL');
  }
  if (reason === 'empty') {
    return new GavetaError('E_ARG_INVALID');
  }
  return new GavetaError('E_PATH_OUTSIDE_VAULT');
}
