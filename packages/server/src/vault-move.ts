export interface RecentUnlink {
  readonly id: string | null;
  readonly at: number;
}

/** Find a recent path (unlink or add) that shares the same note id within the move window. */
export function pairMoveByNoteId(
  noteId: string | null,
  recentPaths: ReadonlyMap<string, RecentUnlink>,
  nowMs: number,
  windowMs: number,
  excludePath?: string,
): string | null {
  if (noteId === null) {
    return null;
  }
  for (const [partnerPath, meta] of recentPaths) {
    if (partnerPath === excludePath) {
      continue;
    }
    if (nowMs - meta.at > windowMs) {
      continue;
    }
    if (meta.id === noteId) {
      return partnerPath;
    }
  }
  return null;
}
