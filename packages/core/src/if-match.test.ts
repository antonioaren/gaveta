import { expect, it } from 'vitest';
import { GavetaError } from './errors.ts';
import { ABSENT_NOTE_HASH, parseNoteContentHash, requireNoteContentHash } from './if-match.ts';
import { noteContentHash } from './notes.ts';
import { GavetaOperationError } from './ops/error.ts';

it('parses a valid content hash', () => {
  const hash = noteContentHash('hola');
  expect(parseNoteContentHash(hash)).toBe(hash);
});

it('rejects a malformed content hash', () => {
  expect(() => parseNoteContentHash('sha256:no')).toThrow(GavetaError);
});

it('requires if-match for API writes', () => {
  expect(() => {
    requireNoteContentHash('sha256:' + 'a'.repeat(64), undefined);
  }).toThrow(expect.objectContaining({ code: 'E_IF_MATCH_REQUIRED' }));
});

it('throws E_CONFLICT with the current hash on mismatch', () => {
  const current = noteContentHash('actual');
  try {
    requireNoteContentHash(current, noteContentHash('stale'));
  } catch (error) {
    expect(error).toBeInstanceOf(GavetaOperationError);
    expect((error as GavetaOperationError).code).toBe('E_CONFLICT');
    expect((error as GavetaOperationError).details).toEqual({ hash: current });
    return;
  }
  throw new Error('expected throw');
});

it('exports the absent-note sentinel hash', () => {
  expect(ABSENT_NOTE_HASH).toBe(noteContentHash(''));
});
