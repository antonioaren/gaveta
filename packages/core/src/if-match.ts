import { GavetaError } from './errors.ts';
import { GavetaOperationError } from './ops/error.ts';
import { noteContentHash } from './notes.ts';

/** `sha256:` plus 64 lowercase hex digits (note file content hash). */
export const NOTE_CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Hash sent with `if-match` when creating a note at a path that does not exist yet. */
export const ABSENT_NOTE_HASH = noteContentHash('');

export function parseNoteContentHash(value: string): string {
  if (!NOTE_CONTENT_HASH_PATTERN.test(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

/**
 * Enforces optimistic concurrency for API writes and strict CLI `--if-match`.
 * When `expected` is undefined, throws {@link GavetaError} `E_IF_MATCH_REQUIRED`.
 */
export function requireNoteContentHash(current: string, expected: string | undefined): void {
  if (expected === undefined) {
    throw new GavetaError('E_IF_MATCH_REQUIRED');
  }
  const parsed = parseNoteContentHash(expected);
  if (current !== parsed) {
    throw new GavetaOperationError('E_CONFLICT', {}, { hash: current });
  }
}
