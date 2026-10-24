import type { NoteListItem } from '../api/types.ts';
import { splitNotePath } from '../explorer/build-tree.ts';

/** Sorted folder paths for the new-note picker (includes vault root as empty string). */
export function collectFolderPaths(notes: readonly NoteListItem[]): readonly string[] {
  const folders = new Set<string>(['']);
  for (const note of notes) {
    const { folder } = splitNotePath(note.path);
    if (folder.length === 0) {
      continue;
    }
    const segments = folder.split('/');
    let built = '';
    for (const segment of segments) {
      built = built.length === 0 ? segment : `${built}/${segment}`;
      folders.add(built);
    }
  }
  return [...folders].sort((a, b) => {
    if (a.length === 0) {
      return -1;
    }
    if (b.length === 0) {
      return 1;
    }
    return a.localeCompare(b, 'es');
  });
}
