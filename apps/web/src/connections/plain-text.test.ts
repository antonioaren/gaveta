import { expect, it } from 'vitest';
import { plainTextFromContext } from './plain-text.ts';

it('strips HTML tags from backlink context', () => {
  expect(plainTextFromContext('Hola <script>alert(1)</script> mundo')).toBe('Hola mundo');
  expect(plainTextFromContext('<b>negrita</b> y <img src=x onerror=1>')).toBe('negrita y');
});
