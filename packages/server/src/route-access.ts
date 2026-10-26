import { GavetaError } from '@gaveta/core';
import { GAVETA_WS_PATH } from './constants.ts';

export function normalizeServePath(rawUrl: string): string {
  const question = rawUrl.indexOf('?');
  const hash = rawUrl.indexOf('#');
  let end = rawUrl.length;
  if (question !== -1) {
    end = Math.min(end, question);
  }
  if (hash !== -1) {
    end = Math.min(end, hash);
  }
  const pathOnly = rawUrl.slice(0, end);
  const rawPath = pathOnly.length === 0 ? '/' : pathOnly;

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (decoded.includes('\0') || decoded.includes('\\')) {
    throw new GavetaError('E_ARG_INVALID');
  }

  const segments = decoded.split('/').filter((segment) => segment.length > 0);
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new GavetaError('E_ARG_INVALID');
    }
  }
  if (segments.length === 0) {
    return '/';
  }
  return `/${segments.join('/')}`;
}

/** Routes that may be served without the session token (viewer shell only). */
export function isPublicShellRoute(method: string, normalizedPath: string): boolean {
  const verb = method.toUpperCase();
  if (verb !== 'GET' && verb !== 'HEAD') {
    return false;
  }
  if (normalizedPath === '/') {
    return true;
  }
  if (normalizedPath.startsWith('/assets/')) {
    return true;
  }
  if (normalizedPath === '/nota' || normalizedPath.startsWith('/nota/')) {
    return true;
  }
  if (normalizedPath === '/grafo') {
    return true;
  }
  if (normalizedPath === '/tareas') {
    return true;
  }
  return false;
}

/** Isolated note iframe HTML and subresources; session token is not used (render ticket instead). */
export function isRenderRoute(method: string, normalizedPath: string): boolean {
  const verb = method.toUpperCase();
  if (verb !== 'GET' && verb !== 'HEAD') {
    return false;
  }
  return normalizedPath === '/render' || normalizedPath.startsWith('/render/');
}

export function isWebSocketUpgradeRoute(method: string, normalizedPath: string): boolean {
  return method.toUpperCase() === 'GET' && normalizedPath === GAVETA_WS_PATH;
}

export function requiresSessionToken(method: string, normalizedPath: string): boolean {
  if (isPublicShellRoute(method, normalizedPath)) {
    return false;
  }
  if (isRenderRoute(method, normalizedPath)) {
    return false;
  }
  if (isWebSocketUpgradeRoute(method, normalizedPath)) {
    return false;
  }
  return true;
}

/** Canonical path (plus query) for Fastify routing and access checks. */
export function rewriteServeUrl(rawUrl: string | undefined): string | undefined {
  if (rawUrl === undefined) {
    return rawUrl;
  }
  const question = rawUrl.indexOf('?');
  const pathPart = question === -1 ? rawUrl : rawUrl.slice(0, question);
  const query = question === -1 ? '' : rawUrl.slice(question);
  try {
    return normalizeServePath(pathPart) + query;
  } catch {
    return rawUrl;
  }
}
