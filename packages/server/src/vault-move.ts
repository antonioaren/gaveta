import path from 'node:path';

export function pairMoveEvent(
  addPath: string,
  recentUnlinks: ReadonlyMap<string, number>,
  nowMs: number,
  windowMs: number,
): { readonly from: string; readonly to: string } | null {
  for (const [from, at] of recentUnlinks) {
    if (nowMs - at > windowMs) {
      continue;
    }
    if (path.dirname(from) === path.dirname(addPath)) {
      return { from, to: addPath };
    }
  }
  return null;
}
