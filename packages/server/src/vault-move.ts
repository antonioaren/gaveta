export interface RecentUnlink {
  readonly id: string | null;
  readonly at: number;
}

export function pairMoveByNoteId(
  noteId: string | null,
  recentUnlinks: ReadonlyMap<string, RecentUnlink>,
  nowMs: number,
  windowMs: number,
): string | null {
  if (noteId === null) {
    return null;
  }
  for (const [fromPath, meta] of recentUnlinks) {
    if (nowMs - meta.at > windowMs) {
      continue;
    }
    if (meta.id === noteId) {
      return fromPath;
    }
  }
  return null;
}
