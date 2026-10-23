import { GavetaError } from '@gaveta/core';
import { expect, it } from 'vitest';
import { isPublicShellRoute, normalizeServePath, requiresSessionToken } from './route-access.ts';

it('normalizes collapsed slashes and decodes percent-encoding before access checks', () => {
  expect(normalizeServePath('//api/notes')).toBe('/api/notes');
  expect(normalizeServePath('/%61pi/notes')).toBe('/api/notes');
  expect(requiresSessionToken('GET', normalizeServePath('/%61pi/notes'))).toBe(true);
});

it('treats only the shell allowlist as public', () => {
  expect(isPublicShellRoute('GET', '/')).toBe(true);
  expect(isPublicShellRoute('HEAD', '/assets/app.js')).toBe(true);
  expect(isPublicShellRoute('GET', '/nota/demo.html')).toBe(true);
  expect(isPublicShellRoute('GET', '/api/notes')).toBe(false);
  expect(isPublicShellRoute('GET', '/api')).toBe(false);
  expect(isPublicShellRoute('GET', '/API/notes')).toBe(false);
  expect(isPublicShellRoute('GET', '/render/01NOTE')).toBe(false);
  expect(isPublicShellRoute('GET', '/typo')).toBe(false);
});

it('rejects traversal segments in the path', () => {
  expect(() => normalizeServePath('/assets/../api/notes')).toThrow(GavetaError);
});
