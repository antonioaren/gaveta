import type { NoteListItem } from '../api/types.ts';
import { splitNotePath } from '../explorer/build-tree.ts';
import { allocateSlug, slugify } from './note-slug.ts';

export function takenStemsInFolder(
  notes: readonly NoteListItem[],
  folder: string,
): ReadonlySet<string> {
  const taken = new Set<string>();
  for (const note of notes) {
    const { folder: noteFolder, file } = splitNotePath(note.path);
    if (noteFolder !== folder || !file.endsWith('.html')) {
      continue;
    }
    taken.add(file.slice(0, -'.html'.length));
  }
  return taken;
}

export function previewNotePath(
  title: string,
  folder: string,
  notes: readonly NoteListItem[],
): string {
  const base = slugify(title);
  const stem = allocateSlug(base.length === 0 ? 'nota' : base, takenStemsInFolder(notes, folder));
  const file = `${stem}.html`;
  return folder.length === 0 ? file : `${folder}/${file}`;
}
