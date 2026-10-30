import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, describe, it } from 'vitest';
import { BODY_ELEMENTS, COMPONENTS, CONTRACT_CLASSES } from '../contract.ts';
import { DEFAULT_THEME_CSS } from '../index.ts';
import { DEFAULT_THEME_CSS as themeSource } from './theme.ts';

/**
 * Text tokens can nest inside any surface (a link in a callout on a slide).
 * UI tokens are borders, focus rings, and controls drawn on those surfaces.
 */
const TEXT_TOKENS = [
  '--color-text',
  '--color-muted',
  '--color-link',
  '--color-pending',
  '--color-accent',
  '--color-danger',
] as const;
const SURFACE_TOKENS = [
  '--color-bg',
  '--color-surface',
  '--color-surface-elevated',
  '--color-code-bg',
  '--color-kbd-bg',
  '--color-info-bg',
  '--color-warn-bg',
  '--color-tip-bg',
  '--color-note-bg',
  '--color-danger-bg',
  '--color-success-bg',
  '--color-notes-bg',
  '--color-header-bg',
  '--color-mark-bg',
] as const;
const UI_TOKENS = [
  '--color-border',
  '--color-focus',
  '--color-control',
  '--color-accent-doc',
  '--color-accent-slides',
  '--color-accent-todo',
  '--color-accent-dashboard',
  '--color-accent-design',
  '--color-accent-artifact',
] as const;

const TEXT_CONTRAST = 4.5;
const UI_CONTRAST = 3;

const NAMED_COLORS = [
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
  'canvas',
  'canvastext',
  'linktext',
  'visitedtext',
  'activetext',
  'graytext',
  'buttontext',
  'buttonface',
  'highlight',
  'highlighttext',
  'window',
  'windowtext',
  'field',
  'fieldtext',
] as const;

interface CssBlock {
  prelude: string;
  body: string;
}

interface StyleRule {
  selector: string;
  declarations: string;
}

function isIdentChar(character: string): boolean {
  return /^[A-Za-z0-9_-]$/.test(character);
}

function stripComments(css: string): string {
  let result = '';
  let cursor = 0;
  while (cursor < css.length) {
    const start = css.indexOf('/*', cursor);
    if (start === -1) {
      result += css.slice(cursor);
      break;
    }
    result += css.slice(cursor, start);
    const end = css.indexOf('*/', start + 2);
    if (end === -1) {
      break;
    }
    cursor = end + 2;
  }
  return result;
}

function topLevelBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = -1;
  let quote = '';
  for (let index = 0; index < css.length; index += 1) {
    const character = css.charAt(index);
    if (quote !== '') {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') {
      if (depth === 0) {
        bodyStart = index + 1;
      }
      depth += 1;
      continue;
    }
    if (character === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && bodyStart !== -1) {
        blocks.push({
          prelude: css.slice(preludeStart, bodyStart - 1).trim(),
          body: css.slice(bodyStart, index),
        });
        preludeStart = index + 1;
        bodyStart = -1;
      }
    }
  }
  return blocks;
}

function isConditional(prelude: string): boolean {
  return (
    prelude.startsWith('@media') ||
    prelude.startsWith('@supports') ||
    prelude.startsWith('@layer') ||
    prelude.startsWith('@container')
  );
}

function collectStyleRules(css: string): StyleRule[] {
  const rules: StyleRule[] = [];
  function walk(source: string): void {
    for (const block of topLevelBlocks(source)) {
      if (block.prelude.startsWith('@')) {
        if (isConditional(block.prelude)) {
          walk(block.body);
        }
        continue;
      }
      if (block.prelude.length > 0 && block.body.includes(':')) {
        rules.push({ selector: block.prelude, declarations: block.body });
      }
    }
  }
  walk(stripComments(css));
  return rules;
}

function splitSelectors(selector: string): string[] {
  return selector
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function containsToken(haystack: string, token: string): boolean {
  let from = 0;
  while (from < haystack.length) {
    const found = haystack.indexOf(token, from);
    if (found === -1) {
      return false;
    }
    const before = found === 0 ? '' : haystack.charAt(found - 1);
    const after = haystack.charAt(found + token.length);
    if ((before === '' || !isIdentChar(before)) && (after === '' || !isIdentChar(after))) {
      return true;
    }
    from = found + 1;
  }
  return false;
}

function targetsClass(selector: string, className: string): boolean {
  const token = `.${className}`;
  let from = 0;
  while (from < selector.length) {
    const found = selector.indexOf(token, from);
    if (found === -1) {
      return false;
    }
    const after = selector.charAt(found + token.length);
    if (after === '' || !isIdentChar(after)) {
      return true;
    }
    from = found + 1;
  }
  return false;
}

function skipBlock(selector: string, index: number, open: string, close: string): number {
  let depth = 1;
  let cursor = index + 1;
  let quote = '';
  while (cursor < selector.length && depth > 0) {
    const character = selector.charAt(cursor);
    if (quote !== '') {
      if (character === '\\') {
        cursor += 2;
        continue;
      }
      if (character === quote) {
        quote = '';
      }
      cursor += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      cursor += 1;
      continue;
    }
    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
    }
    cursor += 1;
  }
  return cursor;
}

/** Drops classes, ids, attributes, and pseudos so only type selectors remain. */
function typeSelectors(selector: string): string {
  let result = '';
  let index = 0;
  while (index < selector.length) {
    const character = selector.charAt(index);
    if (character === '.' || character === '#') {
      index += 1;
      while (isIdentChar(selector.charAt(index))) {
        index += 1;
      }
      result += ' ';
      continue;
    }
    if (character === '[') {
      index = skipBlock(selector, index, '[', ']');
      result += ' ';
      continue;
    }
    if (character === ':') {
      index += 1;
      if (selector.charAt(index) === ':') {
        index += 1;
      }
      while (isIdentChar(selector.charAt(index))) {
        index += 1;
      }
      if (selector.charAt(index) === '(') {
        index = skipBlock(selector, index, '(', ')');
      }
      result += ' ';
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

function targetsElement(selector: string, element: string): boolean {
  return containsToken(typeSelectors(selector), element);
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function readColorTokens(body: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const part of body.split(';')) {
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

function tokensByScheme(css: string): { light: Map<string, string>; dark: Map<string, string> } {
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  function absorb(body: string, scheme: 'light' | 'dark'): void {
    const target = scheme === 'dark' ? dark : light;
    for (const [name, value] of readColorTokens(body)) {
      target.set(name, value);
    }
  }
  function walk(source: string, scheme: 'light' | 'dark'): void {
    for (const block of topLevelBlocks(source)) {
      if (block.prelude.startsWith('@media') && block.prelude.includes('print')) {
        continue;
      }
      if (
        block.prelude.startsWith('@media') &&
        block.prelude.includes('prefers-color-scheme') &&
        block.prelude.includes('dark')
      ) {
        walk(block.body, 'dark');
        continue;
      }
      if (block.prelude.startsWith('@')) {
        if (isConditional(block.prelude)) {
          walk(block.body, scheme);
        }
        continue;
      }
      if (block.prelude === ':root') {
        absorb(block.body, scheme);
      }
    }
  }
  walk(stripComments(css), 'light');
  return { light, dark };
}

function propertyBefore(css: string, hashIndex: number): string {
  let cursor = hashIndex;
  while (cursor > 0 && /\s/.test(css.charAt(cursor - 1))) {
    cursor -= 1;
  }
  if (css.charAt(cursor - 1) !== ':') {
    return '';
  }
  cursor -= 1;
  while (cursor > 0 && /\s/.test(css.charAt(cursor - 1))) {
    cursor -= 1;
  }
  const end = cursor;
  while (cursor > 0 && isIdentChar(css.charAt(cursor - 1))) {
    cursor -= 1;
  }
  return css.slice(cursor, end);
}

function rawColorProblems(css: string): string[] {
  const problems: string[] = [];
  const stripped = stripComments(css);
  let index = 0;
  while (index < stripped.length) {
    const hash = stripped.indexOf('#', index);
    if (hash === -1) {
      break;
    }
    const hex = stripped.slice(hash, hash + 7);
    const next = stripped.charAt(hash + 7);
    if (!/^#[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]$/i.test(next)) {
      problems.push(stripped.slice(hash, hash + 12));
      index = hash + 1;
      continue;
    }
    const property = propertyBefore(stripped, hash);
    if (!property.startsWith('--color-')) {
      problems.push(`${hex} outside a color token`);
    }
    index = hash + 7;
  }
  const lowered = stripped.toLowerCase();
  for (const fn of [
    'rgb(',
    'rgba(',
    'hsl(',
    'hsla(',
    'hwb(',
    'lab(',
    'lch(',
    'oklab(',
    'oklch(',
    'color(',
  ]) {
    if (lowered.includes(fn)) {
      problems.push(fn);
    }
  }
  for (const name of NAMED_COLORS) {
    if (containsToken(lowered, name)) {
      problems.push(name);
    }
  }
  return problems;
}

function referencedColorTokens(css: string): string[] {
  const names: string[] = [];
  const needle = 'var(--color-';
  let from = 0;
  const stripped = stripComments(css);
  while (from < stripped.length) {
    const found = stripped.indexOf(needle, from);
    if (found === -1) {
      break;
    }
    const start = found + 'var('.length;
    const end = stripped.indexOf(')', start);
    if (end === -1) {
      break;
    }
    const token = stripped.slice(start, end).split(',')[0]?.trim() ?? '';
    names.push(token);
    from = end + 1;
  }
  return names;
}

function requireHex(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined || !/^#[0-9a-f]{6}$/.test(value)) {
    throw new Error(`${name} is not a 6-digit lowercase hex color`);
  }
  return value;
}

function hasAttributeValue(css: string, name: string, value: string): boolean {
  return css.includes(`${name}="${value}"`) || css.includes(`${name}='${value}'`);
}

function vaultThemeFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...vaultThemeFiles(full));
      continue;
    }
    if (full.split(sep).join('/').endsWith('.gaveta/theme.css')) {
      found.push(full);
    }
  }
  return found.sort();
}

describe('default theme', () => {
  it('ships the stylesheet from core for init to copy', () => {
    expect(themeSource).toBe(DEFAULT_THEME_CSS);
    expect(DEFAULT_THEME_CSS.length).toBeGreaterThan(0);
    expect(DEFAULT_THEME_CSS.endsWith('\n')).toBe(true);
    expect(DEFAULT_THEME_CSS).toContain('color-scheme: light');
    expect(DEFAULT_THEME_CSS).toContain('color-scheme: dark');
    expect(DEFAULT_THEME_CSS).toContain('prefers-color-scheme: dark');
    expect(DEFAULT_THEME_CSS).toContain("html[data-theme='light']");
    expect(DEFAULT_THEME_CSS).toContain("html[data-theme='dark']");
    expect(DEFAULT_THEME_CSS).toContain('--font-sans');
    expect(DEFAULT_THEME_CSS).toContain('--radius-md');
  });

  it('has a rule for every body element', () => {
    const rules = collectStyleRules(DEFAULT_THEME_CSS);
    const missing = BODY_ELEMENTS.filter((element) =>
      rules.every((rule) =>
        splitSelectors(rule.selector).every((part) => !targetsElement(part, element.name)),
      ),
    ).map((element) => element.name);
    expect(missing).toEqual([]);
  });

  it('has a rule for every contract class on its element', () => {
    const rules = collectStyleRules(DEFAULT_THEME_CSS);
    const missing = CONTRACT_CLASSES.filter((entry) =>
      rules.every((rule) =>
        splitSelectors(rule.selector).every(
          (part) =>
            !targetsClass(part, entry.name) ||
            entry.elements.every((element) => !targetsElement(part, element)),
        ),
      ),
    ).map((entry) => entry.name);
    expect(missing).toEqual([]);
  });

  it('has a rule for every component', () => {
    const rules = collectStyleRules(DEFAULT_THEME_CSS);
    const missing = COMPONENTS.filter((component) => {
      const className = component.className;
      return rules.every((rule) =>
        splitSelectors(rule.selector).every((part) => {
          if (!targetsElement(part, component.element)) {
            return true;
          }
          return className !== undefined && !targetsClass(part, className);
        }),
      );
    }).map((component) => component.id);
    expect(missing).toEqual([]);
  });

  it('styles callout kinds and task fields without scripts', () => {
    const css = stripComments(DEFAULT_THEME_CSS);
    expect(hasAttributeValue(css, 'data-kind', 'info')).toBe(true);
    expect(hasAttributeValue(css, 'data-kind', 'warn')).toBe(true);
    expect(hasAttributeValue(css, 'data-kind', 'tip')).toBe(true);
    expect(hasAttributeValue(css, 'data-kind', 'danger')).toBe(true);
    expect(hasAttributeValue(css, 'data-kind', 'note')).toBe(true);
    expect(hasAttributeValue(css, 'data-kind', 'success')).toBe(true);
    expect(css).toContain('.badge');
    expect(css).toContain('.note-header');
    expect(css).toContain('.toc');
    expect(css).toContain('data-g-task');
    expect(css).toContain('data-g-due');
    expect(css).toContain('data-g-priority');
    expect(hasAttributeValue(css, 'type', 'checkbox')).toBe(true);
    expect(css.includes('<script')).toBe(false);
  });

  it('meets WCAG 2.1 AA contrast for every color token in light and dark', () => {
    const { light, dark } = tokensByScheme(DEFAULT_THEME_CSS);
    const known = [...TEXT_TOKENS, ...SURFACE_TOKENS, ...UI_TOKENS].sort();
    expect([...light.keys()].sort()).toEqual(known);
    expect([...dark.keys()].sort()).toEqual(known);
    expect(light.get('--color-text')).toBe('#18181b');
    expect(light.get('--color-bg')).toBe('#f4f4f5');

    const failures: string[] = [];
    for (const [scheme, tokens] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      for (const foreground of TEXT_TOKENS) {
        for (const background of SURFACE_TOKENS) {
          const ratio = contrastRatio(
            requireHex(tokens, foreground),
            requireHex(tokens, background),
          );
          if (ratio < TEXT_CONTRAST) {
            failures.push(
              `${scheme} ${foreground} on ${background} is ${ratio.toFixed(2)} (need ${TEXT_CONTRAST.toString()})`,
            );
          }
        }
      }
      for (const foreground of UI_TOKENS) {
        for (const background of SURFACE_TOKENS) {
          const ratio = contrastRatio(
            requireHex(tokens, foreground),
            requireHex(tokens, background),
          );
          if (ratio < UI_CONTRAST) {
            failures.push(
              `${scheme} ${foreground} on ${background} is ${ratio.toFixed(2)} (need ${UI_CONTRAST.toString()})`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);

    for (const name of referencedColorTokens(DEFAULT_THEME_CSS)) {
      if (name === '--color-print-text' || name === '--color-print-bg') {
        continue;
      }
      expect(light.has(name), name).toBe(true);
    }
    const colorProblems = rawColorProblems(DEFAULT_THEME_CSS).filter(
      (problem) => !problem.startsWith('#0a0a0a') && !problem.startsWith('#ffffff'),
    );
    expect(colorProblems).toEqual([]);
  });

  it('does not load remote resources or scriptable CSS', () => {
    const lowered = DEFAULT_THEME_CSS.toLowerCase();
    expect(lowered.includes('url(')).toBe(false);
    expect(lowered.includes('@import')).toBe(false);
    expect(lowered.includes('expression(')).toBe(false);
    expect(lowered.includes('javascript:')).toBe(false);
    expect(lowered.includes('http:')).toBe(false);
    expect(lowered.includes('https:')).toBe(false);
    expect(stripComments(lowered).includes('//')).toBe(false);
  });

  it('is copied byte for byte into every fixture vault', () => {
    const fixturesRoot = join(import.meta.dirname, '../../../../fixtures');
    const vaultsDir = join(fixturesRoot, 'vaults');
    const showcaseDir = join(fixturesRoot, 'showcase');
    const files = [...vaultThemeFiles(vaultsDir), ...vaultThemeFiles(showcaseDir)];
    expect(
      files
        .map((file) => {
          const fromVaults = relative(vaultsDir, file);
          if (!fromVaults.startsWith('..')) {
            return fromVaults.split(sep).join('/');
          }
          return relative(showcaseDir, file).split(sep).join('/');
        })
        .sort(),
    ).toEqual([
      '.gaveta/theme.css',
      'backlinks/.gaveta/theme.css',
      'empty/.gaveta/theme.css',
      'malicious/.gaveta/theme.css',
      'problems/.gaveta/theme.css',
    ]);
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).toBe(DEFAULT_THEME_CSS);
    }
  });
});
