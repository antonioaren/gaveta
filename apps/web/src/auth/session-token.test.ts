// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  bootstrapSessionToken,
  clearSessionToken,
  getSessionToken,
  setSessionToken,
} from './session-token.ts';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  clearSessionToken();
  vi.restoreAllMocks();
});

it('reads ?token=, stores it in sessionStorage, and strips the query param', () => {
  window.history.replaceState({}, '', '/?token=abc123&foo=bar');
  const token = bootstrapSessionToken();
  expect(token).toBe('abc123');
  expect(sessionStorage.getItem('gaveta.sessionToken')).toBe('abc123');
  expect(window.location.search).toBe('?foo=bar');
  expect(window.location.pathname).toBe('/');
});

it('reuses sessionStorage when the query param is absent', () => {
  setSessionToken('stored');
  window.history.replaceState({}, '', '/notes');
  expect(bootstrapSessionToken()).toBe('stored');
});

it('never uses localStorage', () => {
  localStorage.setItem('gaveta.sessionToken', 'leak');
  window.history.replaceState({}, '', '/?token=from-query');
  bootstrapSessionToken();
  expect(getSessionToken()).toBe('from-query');
  expect(localStorage.getItem('gaveta.sessionToken')).toBe('leak');
});
