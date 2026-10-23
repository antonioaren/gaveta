import { GavetaError } from '@gaveta/core';
import { expect, it } from 'vitest';
import { GAVETA_WS_PATH } from './constants.ts';
import {
  isPublicShellRoute,
  isRenderRoute,
  isWebSocketUpgradeRoute,
  normalizeServePath,
  requiresSessionToken,
  rewriteServeUrl,
} from './route-access.ts';

it('normalizes collapsed slashes and decodes percent-encoding before access checks', () => {
  expect(normalizeServePath('//api/notes')).toBe('/api/notes');
  expect(normalizeServePath('/%61pi/notes')).toBe('/api/notes');
  expect(requiresSessionToken('GET', normalizeServePath('/%61pi/notes'))).toBe(true);
});

it('treats only the shell allowlist as public', () => {
  expect(isPublicShellRoute('GET', '/')).toBe(true);
  expect(isPublicShellRoute('HEAD', '/assets/app.js')).toBe(true);
  expect(isPublicShellRoute('GET', '/nota/demo.html')).toBe(true);
  expect(isPublicShellRoute('GET', '/grafo')).toBe(true);
  expect(isPublicShellRoute('GET', '/api/notes')).toBe(false);
  expect(isPublicShellRoute('GET', '/api')).toBe(false);
  expect(isPublicShellRoute('GET', '/API/notes')).toBe(false);
  expect(isPublicShellRoute('GET', '/render/01NOTE')).toBe(false);
  expect(isPublicShellRoute('GET', '/typo')).toBe(false);
});

it('rejects traversal segments in the path', () => {
  expect(() => normalizeServePath('/assets/../api/notes')).toThrow(GavetaError);
});

it('rewrites encoded and collapsed-slash URLs before routing', () => {
  expect(rewriteServeUrl('//render/01NOTE')).toBe('/render/01NOTE');
  expect(rewriteServeUrl('/%72ender/01NOTE?t=abc')).toBe('/render/01NOTE?t=abc');
});

it('classifies the live WebSocket upgrade without a session token', () => {
  expect(isWebSocketUpgradeRoute('GET', GAVETA_WS_PATH)).toBe(true);
  expect(isWebSocketUpgradeRoute('GET', '/api/ws-extra')).toBe(false);
  expect(requiresSessionToken('GET', GAVETA_WS_PATH)).toBe(false);
});

it('classifies render routes as ticket-only without a session token', () => {
  expect(isRenderRoute('GET', '/render/01NOTE')).toBe(true);
  expect(isRenderRoute('GET', '/render/static/theme.css')).toBe(true);
  expect(requiresSessionToken('GET', '/render/01NOTE')).toBe(false);
  expect(requiresSessionToken('GET', normalizeServePath('//render/01NOTE'))).toBe(false);
  expect(requiresSessionToken('GET', normalizeServePath('/%72ender/01NOTE'))).toBe(false);
});
