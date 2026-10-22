import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | undefined;
let cachedRoot: string | undefined;

/** Repository root (directory that contains `VERSION` and `pnpm-workspace.yaml`). */
export function workspaceRootFromModuleUrl(moduleUrl: string): string {
  let current = dirname(fileURLToPath(moduleUrl));
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      readFileSync(join(current, 'VERSION'), 'utf8');
      readFileSync(join(current, 'pnpm-workspace.yaml'), 'utf8');
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  throw new Error('Could not locate workspace root from module url');
}

/** SemVer read from the root `VERSION` file (single source of truth). */
export function readWorkspaceVersion(moduleUrl: string = import.meta.url): string {
  if (cachedVersion !== undefined && cachedRoot !== undefined) {
    return cachedVersion;
  }
  const root = workspaceRootFromModuleUrl(moduleUrl);
  const text = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(text)) {
    throw new Error(`Invalid VERSION file: ${text}`);
  }
  cachedRoot = root;
  cachedVersion = text;
  return text;
}
