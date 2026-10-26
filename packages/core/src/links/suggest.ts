import { GavetaError } from '../errors.ts';
import { foldMatchKey } from '../sqlite/schema.ts';
import type { IndexedNote, VaultIndex } from '../sqlite/store.ts';
import { comparePath } from './path.ts';
import { foldsByPath, rankFoldedMatch } from './suggest-rank.ts';
import { SUGGESTION_LIMIT, type NoteSuggestion } from './types.ts';

/**
 * Near titles and aliases. Exact folded matches are omitted.
 * Ranking is case- and accent-insensitive, then stable by path.
 */
export function suggestNotes(
  index: VaultIndex,
  query: string,
  limit = SUGGESTION_LIMIT,
): NoteSuggestion[] {
  if (typeof query !== 'string' || !Number.isInteger(limit)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (limit < 1) {
    return [];
  }
  const folded = foldMatchKey(query.trim());
  if (folded.length === 0) {
    return [];
  }
  const aliasFolds = foldsByPath(index);
  const ranked: { note: IndexedNote; score: number }[] = [];
  for (const note of index.notes()) {
    const folds = [note.titleFolded, ...(aliasFolds.get(note.path) ?? [])];
    if (folds.includes(folded)) {
      continue;
    }
    let best: number | null = null;
    for (const candidate of folds) {
      const score = rankFoldedMatch(folded, candidate);
      if (score !== null && (best === null || score > best)) {
        best = score;
      }
    }
    if (best !== null) {
      ranked.push({ note, score: best });
    }
  }
  ranked.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return comparePath(left.note.path, right.note.path);
  });
  const suggestions: NoteSuggestion[] = [];
  for (const item of ranked.slice(0, limit)) {
    suggestions.push({
      id: item.note.id,
      title: item.note.title,
      path: item.note.path,
      score: item.score,
    });
  }
  return suggestions;
}
