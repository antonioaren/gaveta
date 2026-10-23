import { apiJson } from '../api/client.ts';
import type { NoteListItem, SearchHitView } from '../api/types.ts';
import { isNoteUlid, noteRenderId } from '../notes/viewer-ref.ts';

export const SEARCH_HIT_NOT_INDEXED_MESSAGE =
  'Esta nota aún no tiene un id en el índice; no se puede abrir desde la paleta hasta que se reindexe.';

export type ResolvedSearchHitOpen =
  | { readonly ok: true; readonly ref: string; readonly noteId: string }
  | { readonly ok: false; readonly message: string };

interface ReadNoteOutline {
  readonly id: string | null;
}

export function resolveSearchHitFromNotes(
  hit: SearchHitView,
  notes: readonly NoteListItem[],
): ResolvedSearchHitOpen | null {
  if (hit.id !== null && isNoteUlid(hit.id)) {
    return { ok: true, ref: hit.id, noteId: hit.id };
  }
  const match = notes.find((note) => note.path === hit.path);
  if (match === undefined) {
    return null;
  }
  const noteId = noteRenderId(match);
  if (noteId === null) {
    return { ok: false, message: SEARCH_HIT_NOT_INDEXED_MESSAGE };
  }
  return { ok: true, ref: noteId, noteId };
}

export async function resolveSearchHitOpen(
  hit: SearchHitView,
  notes: readonly NoteListItem[],
): Promise<ResolvedSearchHitOpen> {
  const fromNotes = resolveSearchHitFromNotes(hit, notes);
  if (fromNotes !== null) {
    return fromNotes;
  }
  try {
    const envelope = await apiJson<ReadNoteOutline>(
      `/api/read?ref=${encodeURIComponent(hit.path)}&as=outline`,
    );
    const id = envelope.data.id;
    if (id !== null && isNoteUlid(id)) {
      return { ok: true, ref: id, noteId: id };
    }
  } catch {
    // Fall through to not-indexed message.
  }
  return { ok: false, message: SEARCH_HIT_NOT_INDEXED_MESSAGE };
}
