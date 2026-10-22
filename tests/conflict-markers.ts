import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ConflictMarkerHit {
  readonly line: number;
  readonly kind: 'start' | 'separator' | 'end';
  readonly text: string;
}

/** Paths (repo-relative) skipped by the tracked-file scan. */
export const CONFLICT_MARKER_SCAN_EXCLUDES: readonly string[] = [];

const START_PREFIX = '<<<<<<< ';
const END_PREFIX = '>>>>>>> ';

export function findConflictMarkersInText(
  content: string,
  options: { readonly markdownAware: boolean },
): ConflictMarkerHit[] {
  const hits: ConflictMarkerHit[] = [];
  const lines = content.split(/\r?\n/u);
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (options.markdownAware) {
      const trimmed = line.trim();
      if (trimmed.startsWith('```')) {
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        continue;
      }
    }

    if (line.startsWith(START_PREFIX)) {
      hits.push({ line: index + 1, kind: 'start', text: line });
      continue;
    }
    if (line.startsWith(END_PREFIX)) {
      hits.push({ line: index + 1, kind: 'end', text: line });
      continue;
    }
    if (line.trim() === '=======') {
      hits.push({ line: index + 1, kind: 'separator', text: line });
    }
  }

  return hits;
}

export function findConflictMarkersInFile(relativePath: string, root: string): ConflictMarkerHit[] {
  if (CONFLICT_MARKER_SCAN_EXCLUDES.some((excluded) => matchesExclude(relativePath, excluded))) {
    return [];
  }
  const absolute = join(root, relativePath);
  let content: string;
  try {
    content = readFileSync(absolute, 'utf8');
  } catch {
    return [];
  }
  const markdownAware = relativePath.endsWith('.md');
  return findConflictMarkersInText(content, { markdownAware });
}

function matchesExclude(relativePath: string, pattern: string): boolean {
  if (pattern.endsWith('/')) {
    return relativePath.startsWith(pattern) || relativePath.includes(`/${pattern}`);
  }
  return relativePath === pattern;
}

export function listTrackedFiles(root: string): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (output.length === 0) {
    return [];
  }
  return output.split('\0').filter((entry) => entry.length > 0);
}

export interface ConflictScanResult {
  readonly path: string;
  readonly hits: readonly ConflictMarkerHit[];
}

export function scanTrackedFilesForConflictMarkers(root: string): ConflictScanResult[] {
  const results: ConflictScanResult[] = [];
  for (const path of listTrackedFiles(root)) {
    const hits = findConflictMarkersInFile(path, root);
    if (hits.length > 0) {
      results.push({ path, hits });
    }
  }
  return results;
}
