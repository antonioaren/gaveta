import { describe, expect, it } from 'vitest';
import { moveDestinationPath, renameDestinationPath } from './note-destination.ts';

describe('renameDestinationPath', () => {
  it('keeps the parent folder and slugifies the title', () => {
    expect(
      renameDestinationPath('carpeta/nota-x.html', 'Nueva Título', ['carpeta/nota-x.html']),
    ).toBe('carpeta/nueva-titulo.html');
  });

  it('adds -2 when the slug collides in the same folder', () => {
    expect(renameDestinationPath('a/nota.html', 'Otra', ['a/nota.html', 'a/otra.html'])).toBe(
      'a/otra-2.html',
    );
  });
});

describe('moveDestinationPath', () => {
  it('preserves the file name under the target folder', () => {
    expect(moveDestinationPath('nota-x.html', 'otra/ruta')).toBe('otra/ruta/nota-x.html');
  });
});
