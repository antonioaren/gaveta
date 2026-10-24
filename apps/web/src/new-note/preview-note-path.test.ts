import type { NoteListItem } from '../api/types.ts';
import { expect, it } from 'vitest';
import { previewNotePath } from './preview-note-path.ts';

function note(path: string): NoteListItem {
  return {
    id: '01JB7Z3K9QX4T5M2N8V6R0WYHE',
    path,
    title: path,
    type: 'doc',
    tags: [],
    aliases: [],
  };
}

it('previews slugified paths and collision suffixes', () => {
  const notes = [note('nota-x.html'), note('carpeta/nota-x.html')];
  expect(previewNotePath('Nota X', '', notes)).toBe('nota-x-2.html');
  expect(previewNotePath('Nota X', 'carpeta', notes)).toBe('carpeta/nota-x-2.html');
  expect(previewNotePath('Árbol', '', [])).toBe('arbol.html');
});
