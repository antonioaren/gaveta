import { describe, expect, it } from 'vitest';
import { allocateSlug, slugify } from './slugify.ts';

describe('slugify', () => {
  it('strips accents and maps punctuation to hyphens', () => {
    expect(slugify('Título — ¡Hola!')).toBe('titulo-hola');
  });

  it('allocates collision suffixes', () => {
    const taken = new Set(['nota', 'nota-2']);
    expect(allocateSlug('nota', taken)).toBe('nota-3');
  });
});
