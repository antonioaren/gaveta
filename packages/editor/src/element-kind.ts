import { BODY_ELEMENTS } from '@gaveta/core';

/** Inline phrasing elements stored as TipTap marks. */
export const MARK_TAGS: ReadonlySet<string> = new Set([
  'strong',
  'em',
  'kbd',
  'mark',
  'sub',
  'sup',
  'small',
  'abbr',
  'time',
  'span',
  'a',
]);

/** Void or atomic inline nodes (not marks). */
export const INLINE_ATOM_TAGS: ReadonlySet<string> = new Set(['br', 'img', 'input']);

/** Block-level elements that only carry inline content. */
export const TEXT_BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'dt',
  'dd',
  'caption',
  'figcaption',
]);

/** Block elements with no children in the editor tree. */
export const VOID_BLOCK_TAGS: ReadonlySet<string> = new Set(['hr']);

export type ElementKind = 'mark' | 'inlineAtom' | 'textBlock' | 'voidBlock' | 'block';

export function elementKind(tag: string): ElementKind {
  if (MARK_TAGS.has(tag)) {
    return 'mark';
  }
  if (INLINE_ATOM_TAGS.has(tag)) {
    return 'inlineAtom';
  }
  if (TEXT_BLOCK_TAGS.has(tag)) {
    return 'textBlock';
  }
  if (VOID_BLOCK_TAGS.has(tag)) {
    return 'voidBlock';
  }
  return 'block';
}

const BODY_TAG_SET: ReadonlySet<string> = new Set(BODY_ELEMENTS.map((entry) => entry.name));

export function isContractBodyTag(tag: string): boolean {
  return BODY_TAG_SET.has(tag);
}
