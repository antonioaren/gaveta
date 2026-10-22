import { describe, expect, it } from 'vitest';
import { resolveInsideVault, themeHrefFor } from './paths.ts';

describe('theme href depth', () => {
  it('counts directories above the note', () => {
    expect(themeHrefFor('nota-x.html')).toBe('.gaveta/theme.css');
    expect(themeHrefFor('enlaces/enlace-01.html')).toBe('../.gaveta/theme.css');
    expect(themeHrefFor('enlaces/mas/enlace-11.html')).toBe('../../.gaveta/theme.css');
  });
});

describe('vault-relative references', () => {
  it('resolves a relative href that stays inside the vault', () => {
    expect(resolveInsideVault('enlaces/enlace-01.html', '../nota-x.html')).toBe('nota-x.html');
    expect(resolveInsideVault('enlaces/mas/enlace-11.html', '../../nota-x.html')).toBe(
      'nota-x.html',
    );
    expect(resolveInsideVault('nota-x.html', 'attachments/pixel.png')).toBe(
      'attachments/pixel.png',
    );
    expect(resolveInsideVault('nota-x.html', '.gaveta/theme.css')).toBe('.gaveta/theme.css');
    expect(resolveInsideVault('dup/duplicado-alfa.html', '../nota-destino.html')).toBe(
      'nota-destino.html',
    );
  });

  it('rejects schemes, absolute paths, backslashes, and escapes', () => {
    expect(resolveInsideVault('nota.html', 'javascript:alert(1)')).toBeNull();
    expect(resolveInsideVault('nota.html', 'JAVASCRIPT:alert(1)')).toBeNull();
    expect(resolveInsideVault('nota.html', ' javascript:alert(1)')).toBeNull();
    expect(resolveInsideVault('nota.html', 'https://evil.example/pixel.png')).toBeNull();
    expect(resolveInsideVault('nota.html', 'http://evil.example/pixel.png')).toBeNull();
    expect(resolveInsideVault('nota.html', '//evil.example/pixel.png')).toBeNull();
    expect(resolveInsideVault('nota.html', 'data:text/html,hello')).toBeNull();
    expect(resolveInsideVault('nota.html', '/etc/passwd')).toBeNull();
    expect(resolveInsideVault('nota.html', '../../fuera.html')).toBeNull();
    expect(resolveInsideVault('nota.html', '..\\..\\fuera.html')).toBeNull();
    expect(resolveInsideVault('nota.html', 'attachments/../../fuera.png')).toBeNull();
    expect(resolveInsideVault('nota.html', 'nota.html\0.png')).toBeNull();
  });
});
