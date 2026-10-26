import type { VaultIndex } from '../sqlite/store.ts';

export function foldsByPath(index: VaultIndex): Map<string, string[]> {
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

/** Fuzzy score between folded strings, or null when too far apart. */
export function rankFoldedMatch(query: string, candidate: string): number | null {
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
