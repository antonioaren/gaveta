import type { NoteListItem } from '../api/types.ts';
import { viewerRefForNote } from '../notes/viewer-ref.ts';

export type NoteOpKind = 'rename' | 'move' | 'delete';

export interface NoteOpTarget {
  readonly ref: string;
  readonly path: string;
  readonly title: string;
  readonly noteId: string | null;
}

export function noteOpTargetFromListItem(note: NoteListItem): NoteOpTarget {
  return {
    ref: viewerRefForNote(note),
    path: note.path,
    title: note.title,
    noteId: note.id,
  };
}
