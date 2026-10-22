import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MERMAID_MIN_BASENAME = 'mermaid.min.js';
export const MERMAID_BOOT_BASENAME = 'mermaid-boot.js';
export const MERMAID_LICENSE_BASENAME = 'MERMAID-LICENSE.txt';

export const MERMAID_DIRECTORY = '.gaveta';

export const MERMAID_MIN_RELATIVE = `${MERMAID_DIRECTORY}/${MERMAID_MIN_BASENAME}`;
export const MERMAID_BOOT_RELATIVE = `${MERMAID_DIRECTORY}/${MERMAID_BOOT_BASENAME}`;
export const MERMAID_LICENSE_RELATIVE = `${MERMAID_DIRECTORY}/${MERMAID_LICENSE_BASENAME}`;

export const MERMAID_VAULT_ASSETS = [
  MERMAID_MIN_RELATIVE,
  MERMAID_BOOT_RELATIVE,
  MERMAID_LICENSE_RELATIVE,
] as const;

export const MERMAID_SCRIPT_ATTR = 'data-gaveta';
export const MERMAID_LIB_ROLE = 'mermaid-lib';
export const MERMAID_BOOT_ROLE = 'mermaid-boot';

export const MERMAID_META = 'gaveta:mermaid';

const themeDir = join(import.meta.dirname, '..', 'theme');

/** Pinned Mermaid bundle shipped with the vault (see MERMAID-LICENSE.txt). */
export const DEFAULT_MERMAID_MIN_JS = readFileSync(join(themeDir, MERMAID_MIN_BASENAME), 'utf8');

export const DEFAULT_MERMAID_BOOT_JS = readFileSync(join(themeDir, MERMAID_BOOT_BASENAME), 'utf8');

export const DEFAULT_MERMAID_LICENSE = readFileSync(
  join(themeDir, MERMAID_LICENSE_BASENAME),
  'utf8',
);

/** Stylesheet-style relative href from a note path to a `.gaveta/` asset. */
export function mermaidAssetHref(notePath: string, basename: string): string {
  const depth = notePath.split('/').length - 1;
  return `${'../'.repeat(depth)}${MERMAID_DIRECTORY}/${basename}`;
}

export function isMermaidAssetHref(href: string, basename: string): boolean {
  let rest = href.trim();
  while (rest.startsWith('../')) {
    rest = rest.slice(3);
  }
  return rest === `${MERMAID_DIRECTORY}/${basename}`;
}
