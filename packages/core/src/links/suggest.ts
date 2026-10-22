import { GavetaError } from '../errors.ts';
import { foldMatchKey } from '../sqlite/schema.ts';
import type { IndexedNote, VaultIndex } from '../sqlite/store.ts';
import { comparePath } from './path.ts';
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
      const score = rank(folded, candidate);
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

function foldsByPath(index: VaultIndex): Map<string, string[]> {
  const folds = new Map<string, string[]>();
  for (const alias of index.aliases()) {
    const list = folds.get(alias.path);
    if (list === undefined) {
      folds.set(alias.path, [alias.aliasFolded]);
    } else {
      list.push(alias.aliasFolded);
    }
  }
  return folds;
}

function rank(query: string, candidate: string): number | null {
  if (query.length === 0 || candidate.length === 0 || query === candidate) {
    return null;
  }
  const shorter = query.length < candidate.length ? query : candidate;
  const longer = shorter === query ? candidate : query;
  const contained = shorter.length >= 4 && longer.includes(shorter);
  const maxLen = longer.length;
  const maxDist = Math.floor(maxLen * 0.5);
  if (!contained && Math.abs(query.length - candidate.length) > maxDist) {
    return null;
  }
  const distance = levenshtein(query, candidate, maxDist);
  if (distance !== null) {
    const score = 1 - distance / maxLen;
    if (score >= 0.5) {
      return roundScore(score);
    }
  }
  if (!contained) {
    return null;
  }
  const boosted = shorter.length / maxLen;
  if (boosted < 0.5) {
    return null;
  }
  return roundScore(boosted);
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

function levenshtein(left: string, right: string, max: number): number | null {
  if (Math.abs(left.length - right.length) > max) {
    return null;
  }
  let previous: number[] = [];
  for (let column = 0; column <= right.length; column += 1) {
    previous.push(column);
  }
  for (let row = 1; row <= left.length; row += 1) {
    const next = [row];
    let rowMin = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const deletion = (previous[column] ?? max + 1) + 1;
      const insertion = (next[column - 1] ?? max + 1) + 1;
      const substitution = (previous[column - 1] ?? max + 1) + cost;
      const value = Math.min(deletion, insertion, substitution);
      next.push(value);
      if (value < rowMin) {
        rowMin = value;
      }
    }
    if (rowMin > max) {
      return null;
    }
    previous = next;
  }
  const distance = previous[right.length];
  if (distance === undefined || distance > max) {
    return null;
  }
  return distance;
}
