import type { NoteListItem } from '../api/types.ts';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

export function isNoteUlid(value: string): boolean {
  return ULID_PATTERN.test(value);
}

/** Stable ref for `/nota/:ref` URLs: ULID when indexed, otherwise vault path. */
export function viewerRefForNote(note: NoteListItem): string {
  if (note.id !== null && note.id.length > 0) {
    return note.id;
  }
  return note.path;
}

/** ULID required for `/render` (T2.3); null when the note is not indexed yet. */
export function noteRenderId(note: NoteListItem): string | null {
  if (note.id === null || note.id.length === 0) {
    return null;
  }
  return isNoteUlid(note.id) ? note.id : null;
}
