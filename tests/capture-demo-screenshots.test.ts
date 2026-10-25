import { describe, expect, it } from 'vitest';
import { parseCaptureLang } from '../scripts/capture-demo-locale.ts';

describe('parseCaptureLang', () => {
  it('defaults to en', () => {
    expect(parseCaptureLang([])).toBe('en');
  });

  it('accepts en and es', () => {
    expect(parseCaptureLang(['--lang', 'es'])).toBe('es');
    expect(parseCaptureLang(['--lang', 'en-US'])).toBe('en');
  });

  it('rejects unknown locales', () => {
    expect(() => parseCaptureLang(['--lang', 'fr'])).toThrow(/unsupported/);
  });
});
