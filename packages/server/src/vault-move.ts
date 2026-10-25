export interface RecentUnlink {
  readonly id: string | null;
  readonly at: number;
}

/** Find a buffered watcher path that shares the same note id (FSEvents can split rename pairs by seconds). */
export function pairMoveByNoteId(
  noteId: string | null,
  recentPaths: ReadonlyMap<string, RecentUnlink>,
  _nowMs: number,
  _windowMs: number,
  excludePath?: string,
): string | null {
  if (noteId === null) {
    return null;
  }
  for (const [partnerPath, meta] of recentPaths) {
    if (partnerPath === excludePath) {
      continue;
    }
    if (meta.id === noteId) {
      return partnerPath;
    }
  }
  return null;
}
