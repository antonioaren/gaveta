import { backlinks } from '../graph.ts';
import { comparePath } from '../links/path.ts';
import type { VaultIndex } from '../sqlite/store.ts';
import type { AffectedNote } from './types.ts';

export interface IncomingLinks {
  readonly notes: readonly AffectedNote[];
  readonly counts: ReadonlyMap<string, number>;
}

/** Unique source notes that canonically link to `ref`, plus how many anchors each has. */
export function incomingLinks(index: VaultIndex, ref: string): IncomingLinks {
  const notes: AffectedNote[] = [];
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const link of backlinks(index, ref)) {
    const count = counts.get(link.sourcePath) ?? 0;
    counts.set(link.sourcePath, count + 1);
    if (seen.has(link.sourcePath)) {
      continue;
    }
    seen.add(link.sourcePath);
    notes.push({ id: link.sourceId, title: link.sourceTitle, path: link.sourcePath });
  }
  notes.sort((left, right) => comparePath(left.path, right.path));
  return { notes, counts };
}
