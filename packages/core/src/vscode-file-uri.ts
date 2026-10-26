import path from 'node:path';
import { GavetaError } from './errors.ts';

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[/\\]/;

function isAbsoluteVaultPath(absolutePath: string): boolean {
  return path.isAbsolute(absolutePath) || WINDOWS_DRIVE_PATH.test(absolutePath);
}

function encodePathSegments(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => {
      if (segment === '' || /^[A-Za-z]:$/.test(segment)) {
        return segment;
      }
      return encodeURIComponent(segment);
    })
    .join('/');
}

/**
 * Build a `vscode://file/…` URI for the local VS Code / Cursor desktop handler.
 * The path must already be resolved and confined to the vault by the caller.
 */
export function buildVsCodeFileUri(absolutePath: string): string {
  if (!isAbsoluteVaultPath(absolutePath)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const resolved = path.isAbsolute(absolutePath)
    ? path.resolve(absolutePath)
    : absolutePath.replaceAll('\\', '/');
  let pathname = resolved.replaceAll('\\', '/');
  if (pathname.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (!pathname.startsWith('/') && !/^[A-Za-z]:/.test(pathname)) {
    pathname = `/${pathname}`;
  }
  pathname = encodePathSegments(pathname);
  return `vscode://file${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
