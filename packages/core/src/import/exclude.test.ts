import { describe, expect, it } from 'vitest';
import { vaultPathFromMarkdown } from './exclude.ts';

describe('vaultPathFromMarkdown', () => {
  it('slugifies folder segments and file stems', () => {
    expect(vaultPathFromMarkdown('Mi Nota Ñandú.md', '')).toBe('mi-nota-nandu.html');
    expect(vaultPathFromMarkdown('Carpeta/Café.md', 'importado')).toBe(
      'importado/carpeta/cafe.html',
    );
  });
});
