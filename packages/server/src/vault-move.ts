export interface RecentUnlink {
  readonly id: string | null;
  readonly at: number;
}

/** How long buffered unlink/add paths stay eligible for id pairing (macOS FSEvents gaps). */
export const RECENT_MOVE_PATH_TTL_MS = 120_000;

/** Cap buffered paths so unbounded maps cannot grow during heavy import bursts. */
export const RECENT_MOVE_PATH_MAX_SIZE = 64;

export function pruneRecentMovePaths(
  recentPaths: Map<string, RecentUnlink>,
  nowMs: number,
  ttlMs: number,
  maxSize: number,
): void {
  for (const [path, meta] of recentPaths) {
    if (nowMs - meta.at > ttlMs) {
      recentPaths.delete(path);
    }
  }
  while (recentPaths.size > maxSize) {
    let oldestPath: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [path, meta] of recentPaths) {
      if (meta.at < oldestAt) {
        oldestAt = meta.at;
        oldestPath = path;
      }
    }
    if (oldestPath === undefined) {
      break;
    }
    recentPaths.delete(oldestPath);
  }
}

export function rememberRecentMovePath(
  recentPaths: Map<string, RecentUnlink>,
  path: string,
  id: string | null,
  nowMs: number,
  ttlMs: number,
  maxSize: number,
): void {
  recentPaths.set(path, { id, at: nowMs });
  pruneRecentMovePaths(recentPaths, nowMs, ttlMs, maxSize);
}

/** Find a buffered watcher path that shares the same note id within the pairing TTL. */
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
