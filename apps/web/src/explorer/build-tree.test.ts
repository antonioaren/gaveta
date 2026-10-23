import { expect, it } from 'vitest';
import { buildFolderTree } from './build-tree.ts';
import type { NoteListItem } from '../api/types.ts';

const sample = (path: string, title: string): NoteListItem => ({
  id: null,
  path,
  title,
  type: 'doc',
  tags: [],
  aliases: [],
});

it('groups notes by folder segments', () => {
  const tree = buildFolderTree([
    sample('raiz.html', 'Raíz'),
    sample('carpeta/a.html', 'A'),
    sample('carpeta/b.html', 'B'),
    sample('carpeta/anidada/c.html', 'C'),
  ]);
  expect(tree.notes).toHaveLength(1);
  expect(tree.children).toHaveLength(1);
  const carpeta = tree.children[0];
  expect(carpeta?.notes).toHaveLength(2);
  expect(carpeta?.children[0]?.notes[0]?.title).toBe('C');
});
