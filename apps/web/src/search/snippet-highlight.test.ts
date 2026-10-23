import { expect, it } from 'vitest';
import { parseSnippetHighlight } from './snippet-highlight.ts';

it('splits FTS mark highlights into parts without HTML', () => {
  const parts = parseSnippetHighlight('Hola <mark>Gaveta</mark> y <b>más</b>');
  expect(parts).toEqual([
    { kind: 'text', value: 'Hola ' },
    { kind: 'mark', value: 'Gaveta' },
    { kind: 'text', value: ' y más' },
  ]);
});
