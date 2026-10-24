import type { NoteListItem } from '../api/types.ts';
import { isNoteUlid } from '../notes/viewer-ref.ts';

/** Title-only tab ref for a note that does not exist in the vault yet. */
export function isGhostViewerRef(ref: string, notes: readonly NoteListItem[]): boolean {
  if (isNoteUlid(ref)) {
    return false;
  }
  if (ref.endsWith('.html')) {
    return false;
  }
  return !notes.some((note) => note.path === ref);
}
