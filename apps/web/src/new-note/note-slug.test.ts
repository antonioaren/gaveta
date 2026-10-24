import { allocateSlug, slugify } from '@gaveta/core';
import { expect, it } from 'vitest';
import { allocateSlug as webAllocateSlug, slugify as webSlugify } from './note-slug.ts';

it('matches core slugify and allocateSlug', () => {
  const samples = ['Usar SQLite', 'Árbol', 'Gaveta — PRD', 'foo--bar', ''];
  for (const sample of samples) {
    expect(webSlugify(sample)).toBe(slugify(sample));
  }
  const taken = new Set(['nota', 'nota-2']);
  expect(webAllocateSlug('nota', taken)).toBe(allocateSlug('nota', taken));
});
