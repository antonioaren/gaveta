import { isJavascriptUrl } from '../contract.ts';

export type VaultPathFailure = 'outside' | 'unsafe-url' | 'empty';

export type VaultPathResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: VaultPathFailure };

const HEX = /^[0-9A-Fa-f]{2}$/;

/**
 * Vault-relative path with `..` and percent-decoding applied.
 * Fails closed on traversal, absolute paths, and `javascript:` / `data:` URLs.
 * Does not touch the filesystem.
 */
export function inspectVaultPath(value: string): VaultPathResult {
  const decoded = decodePercents(value);
  if (decoded === null || decoded.includes('\0') || decoded.includes('\\')) {
    return { ok: false, reason: 'outside' };
  }
  if (isJavascriptUrl(decoded) || isDataUrl(decoded)) {
    return { ok: false, reason: 'unsafe-url' };
  }
  if (
    decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    /^file:/i.test(decoded) ||
    /^[a-zA-Z]:[\\/]/.test(decoded)
  ) {
    return { ok: false, reason: 'outside' };
  }
  const segments: string[] = [];
  for (const segment of decoded.split('/')) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length === 0) {
        return { ok: false, reason: 'outside' };
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  return { ok: true, path: segments.join('/') };
}

/**
 * Vault path a relative href points at from `fromPath`.
 * Null for schemes, traversal out of the vault, and fragment-only hrefs.
 */
export function resolveVaultHref(fromPath: string, href: string): string | null {
  if (!isProducedHref(href)) {
    return null;
  }
  const from = inspectVaultPath(fromPath);
  if (!from.ok) {
    return null;
  }
  const hash = href.indexOf('#');
  const pathOnly = hash === -1 ? href : href.slice(0, hash);
  if (pathOnly.length === 0 || pathOnly.includes('?')) {
    return null;
  }
  return resolveAgainst(from.path, pathOnly);
}

/** Relative href from one note path to another. Null when the result would be unsafe. */
export function relativeNoteHref(fromPath: string, toPath: string): string | null {
  const from = inspectVaultPath(fromPath);
  const to = inspectVaultPath(toPath);
  if (!from.ok || !to.ok) {
    return null;
  }
  const href = relativeBetween(from.path, to.path);
  if (!isProducedHref(href)) {
    return null;
  }
  if (resolveAgainst(from.path, href) !== to.path) {
    return null;
  }
  return href;
}

export function isDataUrl(value: string): boolean {
  return /^data:/i.test(compactScheme(value));
}

export function isProducedHref(href: string): boolean {
  if (isJavascriptUrl(href) || isDataUrl(href)) {
    return false;
  }
  if (href.includes('\\') || href.includes('\0') || href.startsWith('/') || href.includes('//')) {
    return false;
  }
  return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href);
}

export function escapeText(value: string): string {
  return stripControls(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function appendFragment(href: string, fragment: string | null): string {
  if (fragment === null) {
    return href;
  }
  return `${href}#${fragment}`;
}

export function safeFragment(value: string | null): string | null {
  if (value === null || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  return value;
}

export function fragmentOf(href: string | null): string | null {
  if (href === null) {
    return null;
  }
  const hash = href.indexOf('#');
  if (hash === -1) {
    return null;
  }
  return safeFragment(href.slice(hash + 1));
}

export function comparePath(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function relativeBetween(fromPath: string, toPath: string): string {
  const fromDir = fromPath.split('/').slice(0, -1);
  const toParts = toPath.split('/');
  let shared = 0;
  while (
    shared < fromDir.length &&
    shared < toParts.length - 1 &&
    fromDir[shared] === toParts[shared]
  ) {
    shared += 1;
  }
  const parts: string[] = [];
  for (let index = 0; index < fromDir.length - shared; index += 1) {
    parts.push('..');
  }
  for (const part of toParts.slice(shared)) {
    parts.push(part);
  }
  return parts.join('/');
}

function resolveAgainst(fromPath: string, href: string): string | null {
  const hash = href.indexOf('#');
  const pathOnly = hash === -1 ? href : href.slice(0, hash);
  const combined = [...fromPath.split('/').slice(0, -1), ...pathOnly.split('/')];
  const segments: string[] = [];
  for (const segment of combined) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    return null;
  }
  return segments.join('/');
}

function decodePercents(value: string): string | null {
  let current = value;
  for (let round = 0; round < 3; round += 1) {
    if (!current.includes('%')) {
      return current;
    }
    const next = decodeOnce(current);
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current.includes('%') ? null : current;
}

function decodeOnce(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '%') {
      out += character ?? '';
      continue;
    }
    const hex = value.slice(index + 1, index + 3);
    if (HEX.test(hex)) {
      out += String.fromCharCode(Number.parseInt(hex, 16));
      index += 2;
      continue;
    }
    out += '%';
  }
  return out;
}

function compactScheme(value: string): string {
  let compact = '';
  for (const character of value) {
    if (character.charCodeAt(0) > 0x20) {
      compact += character;
    }
  }
  return compact;
}

function stripControls(value: string): string {
  let out = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += ' ';
      continue;
    }
    if (code <= 0x1f || code === 0x7f) {
      continue;
    }
    out += character;
  }
  return out;
}
