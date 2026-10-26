import { GavetaError } from '../errors.ts';
import { foldMatchKey } from '../sqlite/schema.ts';
import type { IndexedNote, VaultIndex } from '../sqlite/store.ts';
import { comparePath } from './path.ts';
import { foldsByPath, rankFoldedMatch } from './suggest-rank.ts';

export const WIKILINK_COMPLETION_DEFAULT_LIMIT = 20;

export interface WikilinkCompletion {
  readonly id: string | null;
  readonly title: string;
  readonly path: string;
  readonly matchedBy: 'title' | 'alias';
  /** Title or alias text that matched the query. */
  readonly matchedLabel: string;
  readonly score: number;
}

interface RankedCandidate {
  readonly note: IndexedNote;
  readonly matchedBy: 'title' | 'alias';
  readonly matchedLabel: string;
  readonly score: number;
}

/**
 * Fuzzy wikilink targets by note title and alias, for editor autocomplete.
 * Empty query returns notes sorted by path (up to `limit`).
 */
export function completeWikilinkTargets(
  index: VaultIndex,
  query: string,
  limit = WIKILINK_COMPLETION_DEFAULT_LIMIT,
): WikilinkCompletion[] {
  if (typeof query !== 'string' || !Number.isInteger(limit)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (limit < 1) {
    return [];
  }
  const foldedQuery = foldMatchKey(query.trim());
  if (foldedQuery.length === 0) {
    const notes = [...index.notes()].sort((left, right) => comparePath(left.path, right.path));
    return notes.slice(0, limit).map((note) => ({
      id: note.id,
      title: note.title,
      path: note.path,
      matchedBy: 'title',
      matchedLabel: note.title,
      score: 1,
    }));
  }

  const aliasFolds = foldsByPath(index);
  const ranked: RankedCandidate[] = [];
  for (const note of index.notes()) {
    const titleFold = note.titleFolded;
    const titleScore = scoreLabel(foldedQuery, titleFold);
    if (titleScore !== null) {
      ranked.push({
        note,
        matchedBy: 'title',
        matchedLabel: note.title,
        score: titleScore,
      });
      continue;
    }
    const aliases = note.aliases;
    const aliasFoldList = aliasFolds.get(note.path) ?? [];
    let bestAlias: { label: string; score: number } | null = null;
    for (let indexAlias = 0; indexAlias < aliases.length; indexAlias += 1) {
      const label = aliases[indexAlias];
      const folded = aliasFoldList[indexAlias];
      if (label === undefined || folded === undefined) {
        continue;
      }
      const score = scoreLabel(foldedQuery, folded);
      if (score !== null && (bestAlias === null || score > bestAlias.score)) {
        bestAlias = { label, score };
      }
    }
    if (bestAlias !== null) {
      ranked.push({
        note,
        matchedBy: 'alias',
        matchedLabel: bestAlias.label,
        score: bestAlias.score,
      });
    }
  }

  ranked.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return comparePath(left.note.path, right.note.path);
  });

  const results: WikilinkCompletion[] = [];
  for (const item of ranked.slice(0, limit)) {
    results.push({
      id: item.note.id,
      title: item.note.title,
      path: item.note.path,
      matchedBy: item.matchedBy,
      matchedLabel: item.matchedLabel,
      score: item.score,
    });
  }
  return results;
}

function scoreLabel(queryFolded: string, candidateFolded: string): number | null {
  if (candidateFolded.length === 0) {
    return null;
  }
  if (queryFolded === candidateFolded) {
    return 1;
  }
  if (candidateFolded.startsWith(queryFolded)) {
    return roundScore(0.95 + (queryFolded.length / candidateFolded.length) * 0.05);
  }
  return rankFoldedMatch(queryFolded, candidateFolded);
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}
