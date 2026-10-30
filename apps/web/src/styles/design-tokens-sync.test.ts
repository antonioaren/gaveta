import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_CSS } from '@gaveta/core';

const sharedTokensPath = join(
  import.meta.dirname,
  '../../../../packages/core/src/theme/design-tokens.css',
);
const sharedTokens = readFileSync(sharedTokensPath, 'utf8');

function extractColorTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  for (const part of rootBlock.split(';')) {
    const declaration = part.trim();
    if (!declaration.startsWith('--color-')) {
      continue;
    }
    const colon = declaration.indexOf(':');
    if (colon === -1) {
      continue;
    }
    tokens.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
  }
  return tokens;
}

describe('design token sync', () => {
  it('ships the same :root color tokens in design-tokens.css and the vault default theme', () => {
    const shared = extractColorTokens(sharedTokens);
    const vault = extractColorTokens(DEFAULT_THEME_CSS);
    for (const [name, value] of shared) {
      expect(vault.get(name), name).toBe(value);
    }
  });
});
