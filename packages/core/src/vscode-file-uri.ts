import path from 'node:path';
import { GavetaError } from './errors.ts';

/**
 * Build a `vscode://file/…` URI for the local VS Code / Cursor desktop handler.
 * The path must already be resolved and confined to the vault by the caller.
 */
export function buildVsCodeFileUri(absolutePath: string): string {
  if (!path.isAbsolute(absolutePath)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const resolved = path.resolve(absolutePath);
  let pathname = resolved.replaceAll('\\', '/');
  if (pathname.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }
  return `vscode://file${pathname}`;
}
