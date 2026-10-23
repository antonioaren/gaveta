import { posix } from 'node:path';
import { slugify } from '../contract.ts';

export const DEFAULT_IMPORT_EXCLUDES = [
  '.obsidian/**',
  '.git/**',
  '.trash/**',
  'node_modules/**',
] as const;

export function isDotPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  for (const segment of segments) {
    if (segment.length > 0 && segment.startsWith('.')) {
      return true;
    }
  }
  return false;
}

export function shouldExcludeImportPath(
  relativePath: string,
  patterns: readonly string[],
): boolean {
  if (isDotPath(relativePath)) {
    return true;
  }
  for (const pattern of patterns) {
    if (matchGlob(relativePath, pattern)) {
      return true;
    }
  }
  return false;
}

function matchGlob(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.split('\\').join('/');
  const regex = globToRegExp(pattern);
  return regex.test(normalized);
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.split('\\').join('/');
  let regex = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized.charAt(index);
    if (char === '*') {
      const next = normalized.charAt(index + 1);
      if (next === '*') {
        regex += '.*';
        index += 1;
        if (normalized.charAt(index + 1) === '/') {
          index += 1;
        }
        continue;
      }
      regex += '[^/]*';
      continue;
    }
    if (char === '?') {
      regex += '[^/]';
      continue;
    }
    regex += escapeRegExp(char);
  }
  regex += '$';
  return new RegExp(regex);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function mergeExcludePatterns(user: readonly string[] | undefined): readonly string[] {
  if (user === undefined || user.length === 0) {
    return [...DEFAULT_IMPORT_EXCLUDES];
  }
  return [...DEFAULT_IMPORT_EXCLUDES, ...user];
}

export function vaultPathFromMarkdown(sourceRelativeMd: string, inFolder: string): string {
  const withoutExt = sourceRelativeMd.replace(/\.md$/i, '');
  const parts = withoutExt.split('/').filter((part) => part.length > 0);
  const fileStem = slugify(parts.pop() ?? 'nota') || 'nota';
  const folderSegments = parts.map((part) => slugify(part)).filter((part) => part.length > 0);
  const relativeHtml =
    folderSegments.length === 0
      ? `${fileStem}.html`
      : `${folderSegments.join('/')}/${fileStem}.html`;
  if (inFolder.length === 0) {
    return relativeHtml;
  }
  const inSegments = inFolder
    .replace(/\/$/, '')
    .split('/')
    .map((part) => slugify(part))
    .filter((part) => part.length > 0);
  if (inSegments.length === 0) {
    return relativeHtml;
  }
  return `${inSegments.join('/')}/${relativeHtml}`;
}

export function sourceMdFromVaultHtml(vaultHtmlPath: string, inFolder: string): string {
  const trimmed = inFolder.length === 0 ? vaultHtmlPath : stripPrefix(vaultHtmlPath, inFolder);
  return trimmed.replace(/\.html$/i, '.md');
}

function stripPrefix(value: string, prefix: string): string {
  const normalized = prefix.replace(/\/$/, '');
  if (value === normalized) {
    return '';
  }
  if (value.startsWith(`${normalized}/`)) {
    return value.slice(normalized.length + 1);
  }
  return value;
}

export function resolveSourceMdHref(fromSourceMd: string, href: string): string | null {
  const pathPart = (href.split('#')[0] ?? '').split('?')[0] ?? '';
  if (pathPart.length === 0) {
    return null;
  }
  if (!pathPart.toLowerCase().endsWith('.md')) {
    return null;
  }
  const baseDir = posix.dirname(fromSourceMd);
  const joined = posix.normalize(posix.join(baseDir, pathPart));
  if (joined.startsWith('..')) {
    return null;
  }
  return joined;
}
