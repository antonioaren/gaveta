import { describe, expect, it } from 'vitest';
import { resolveCliLocale, resolveLocaleFromAcceptLanguage, resolveWebLocale } from './locale.ts';

describe('resolveCliLocale', () => {
  it('prefers --lang over env', () => {
    expect(
      resolveCliLocale({ langFlag: 'en', env: { GAVETA_LANG: 'es', LANG: 'es_ES.UTF-8' } }),
    ).toBe('en');
  });

  it('uses GAVETA_LANG then LANG', () => {
    expect(resolveCliLocale({ env: { GAVETA_LANG: 'es', LANG: 'en_US.UTF-8' } })).toBe('es');
    expect(resolveCliLocale({ env: { LANG: 'es_ES.UTF-8' } })).toBe('es');
    expect(resolveCliLocale({ env: {} })).toBe('en');
  });
});

describe('resolveWebLocale', () => {
  it('prefers stored locale over navigator', () => {
    expect(resolveWebLocale({ storedLocale: 'es', navigatorLanguage: 'en-US' })).toBe('es');
    expect(resolveWebLocale({ storedLocale: null, navigatorLanguage: 'es-ES' })).toBe('es');
    expect(resolveWebLocale({ storedLocale: null, navigatorLanguage: 'fr-FR' })).toBe('en');
  });
});

describe('resolveLocaleFromAcceptLanguage', () => {
  it('parses weighted Accept-Language', () => {
    expect(resolveLocaleFromAcceptLanguage('es-ES,es;q=0.9,en;q=0.8')).toBe('es');
    expect(resolveLocaleFromAcceptLanguage('en-US,en;q=0.9')).toBe('en');
  });
});
