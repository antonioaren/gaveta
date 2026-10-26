import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_CSS = join(import.meta.dirname, '../../styles/app.css');

describe('wikilink completion menu styles', () => {
  it('uses opaque app surface tokens for the menu shell and options', () => {
    const css = readFileSync(APP_CSS, 'utf8');
    const menuBlock = css.slice(css.indexOf('.wikilink-completion {'));
    expect(menuBlock).toContain('background: var(--color-surface-elevated)');
    expect(menuBlock).toContain('border: 1px solid var(--color-border)');
    expect(menuBlock).toContain('z-index: 50');
    expect(menuBlock).toContain('.wikilink-completion .palette__option');
    expect(menuBlock).toContain('.wikilink-completion .palette__option--active');
    expect(menuBlock).toMatch(
      /\.wikilink-completion \.palette__option[\s\S]*background:\s*var\(--color-surface-elevated\)/,
    );
    expect(menuBlock).toMatch(
      /\.wikilink-completion \.palette__option--active[\s\S]*var\(--color-surface-elevated\)/,
    );
  });
});
