import { describe, expect, it } from 'vitest';
import { slugify } from './slug.ts';

describe('fixture slug rule', () => {
  it('lowercases, strips accents, and collapses non-alphanumerics', () => {
    expect(slugify('Roadmap')).toBe('roadmap');
    expect(slugify('ROADMAP')).toBe('roadmap');
    expect(slugify('Nota X')).toBe('nota-x');
    expect(slugify('Enlace 01')).toBe('enlace-01');
    expect(slugify('Nota inválida')).toBe('nota-invalida');
    expect(slugify('Nota huérfana')).toBe('nota-huerfana');
    expect(slugify('España')).toBe('espana');
    expect(slugify('  Árbol  ')).toBe('arbol');
    expect(slugify('Gaveta — PRD')).toBe('gaveta-prd');
    expect(slugify('Usar SQLite')).toBe('usar-sqlite');
    expect(slugify('nota-x')).toBe('nota-x');
    expect(slugify('Straße')).toBe('stra-e');
  });

  it('does not append a collision suffix', () => {
    expect(slugify('Nota')).toBe('nota');
  });

  it('rejects a title that slugifies to nothing', () => {
    expect(() => slugify('!!!')).toThrow(/slug/);
  });
});
