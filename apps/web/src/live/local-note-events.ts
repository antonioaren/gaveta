type NoteRemovedListener = (detail: {
  readonly noteId: string | null;
  readonly path: string;
}) => void;

const removedListeners = new Set<NoteRemovedListener>();

export function notifyLocalNoteRemoved(noteId: string | null, path: string): void {
  const detail = { noteId, path };
  for (const listener of removedListeners) {
    listener(detail);
  }
}

export function subscribeLocalNoteRemoved(listener: NoteRemovedListener): () => void {
  removedListeners.add(listener);
  return () => {
    removedListeners.delete(listener);
  };
}
