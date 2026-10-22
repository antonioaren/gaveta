import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { DOCUMENT_SHELL, isUlid } from '../contract.ts';
import { GavetaError } from '../errors.ts';
import {
  appendFragment,
  escapeAttr,
  fragmentOf,
  isProducedHref,
  relativeNoteHref,
  resolveVaultHref,
} from '../links/path.ts';
import { themeStylesheetHref } from '../normalize.ts';
import type { VaultIndex } from '../sqlite/store.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const THEME_FILE = DOCUMENT_SHELL.theme.path;

export interface EditResult {
  readonly html: string;
  readonly anchors: number;
}

/** Point every canonical anchor aimed at `targetId` at `targetPath`. */
export function retargetIncoming(
  html: string,
  notePath: string,
  targetId: string,
  targetPath: string,
): EditResult {
  const parsed = parseSource(html);
  const edits: Edit[] = [];
  let anchors = 0;
  walk(parsed.document, (element) => {
    if (element.tagName !== 'a') {
      return;
    }
    const target = attr(element, 'data-g-to');
    if (target === null || !sameId(target, targetId)) {
      return;
    }
    anchors += 1;
    const href = attr(element, 'href');
    const next = canonicalHref(notePath, targetPath, href);
    if (href === next) {
      return;
    }
    edits.push(setHref(parsed.source, element, next));
  });
  return { html: finish(parsed.bom, parsed.source, edits), anchors };
}

/** Move `html` from `fromPath` to `toPath`: theme, outgoing hrefs, and local assets. */
export function retargetMoved(
  html: string,
  fromPath: string,
  toPath: string,
  movedId: string | null,
  index: VaultIndex,
): EditResult {
  const parsed = parseSource(html);
  const edits: Edit[] = [];
  let anchors = 0;
  walk(parsed.document, (element) => {
    const tag = element.tagName;
    if (tag === 'a') {
      const found = retargetAnchor(parsed.source, element, fromPath, toPath, movedId, index, edits);
      anchors += found;
      return;
    }
    if (tag === 'link') {
      retargetTheme(parsed.source, element, toPath, edits);
      return;
    }
    if (tag === 'img' || tag === 'source') {
      retargetAsset(parsed.source, element, 'src', fromPath, toPath, edits);
    }
  });
  return { html: finish(parsed.bom, parsed.source, edits), anchors };
}

/** Turn canonical anchors aimed at `targetId` into pending links titled `title`. */
export function convertToPending(html: string, targetId: string, title: string): EditResult {
  const parsed = parseSource(html);
  const edits: Edit[] = [];
  let anchors = 0;
  walk(parsed.document, (element) => {
    if (element.tagName !== 'a') {
      return;
    }
    const target = attr(element, 'data-g-to');
    if (target === null || !sameId(target, targetId)) {
      return;
    }
    anchors += 1;
    const href = deleteAttribute(element, 'href');
    if (href !== null) {
      edits.push(href);
    }
    edits.push(must(deleteAttribute(element, 'data-g-to')));
    const pending = attr(element, 'data-g-pending');
    if (pending === title) {
      return;
    }
    if (pending !== null) {
      edits.push(must(replaceAttributeValue(parsed.source, element, 'data-g-pending', title)));
      return;
    }
    edits.push(
      must(insertBeforeEnd(parsed.source, element, ` data-g-pending="${escapeAttr(title)}"`)),
    );
  });
  return { html: finish(parsed.bom, parsed.source, edits), anchors };
}

function retargetAnchor(
  source: string,
  element: ParseElement,
  fromPath: string,
  toPath: string,
  movedId: string | null,
  index: VaultIndex,
  edits: Edit[],
): number {
  const target = attr(element, 'data-g-to');
  const href = attr(element, 'href');
  if (target !== null) {
    const self = movedId !== null && sameId(target, movedId);
    const path = notePathFor(index, target, movedId, toPath);
    if (path !== null) {
      const next = canonicalHref(toPath, path, href);
      if (href !== next) {
        edits.push(setHref(source, element, next));
      }
    }
    return self ? 1 : 0;
  }
  if (attr(element, 'data-g-pending') !== null || href === null) {
    return 0;
  }
  const next = shiftedHref(fromPath, toPath, href);
  if (next !== null && next !== href) {
    edits.push(setHref(source, element, next));
  }
  return 0;
}

function retargetTheme(source: string, element: ParseElement, toPath: string, edits: Edit[]): void {
  const rel = attr(element, 'rel');
  if (!rel?.split(/\s+/u).includes('stylesheet')) {
    return;
  }
  const href = attr(element, 'href');
  if (href === null || !isThemeHref(href)) {
    return;
  }
  const next = themeStylesheetHref(toPath);
  if (href === next) {
    return;
  }
  edits.push(must(replaceAttributeValue(source, element, 'href', next)));
}

function retargetAsset(
  source: string,
  element: ParseElement,
  name: string,
  fromPath: string,
  toPath: string,
  edits: Edit[],
): void {
  const href = attr(element, name);
  if (href === null) {
    return;
  }
  const next = shiftedHref(fromPath, toPath, href);
  if (next === null || next === href) {
    return;
  }
  edits.push(must(replaceAttributeValue(source, element, name, next)));
}

function notePathFor(
  index: VaultIndex,
  id: string,
  movedId: string | null,
  toPath: string,
): string | null {
  if (movedId !== null && sameId(id, movedId)) {
    return toPath;
  }
  if (!isUlid(id)) {
    return null;
  }
  const matches = index.notesById(id);
  if (matches.length > 1) {
    throw new GavetaError('E_ID_DUPLICATE');
  }
  return matches[0]?.path ?? null;
}

function canonicalHref(fromPath: string, targetPath: string, href: string | null): string {
  const relative = relativeNoteHref(fromPath, targetPath);
  if (relative === null) {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  const next = appendFragment(relative, fragmentOf(href));
  if (!isProducedHref(next)) {
    throw new GavetaError('E_UNSAFE_URL');
  }
  return next;
}

function shiftedHref(fromPath: string, toPath: string, href: string): string | null {
  const resolved = resolveVaultHref(fromPath, href);
  if (resolved === null) {
    return null;
  }
  const relative = relativeNoteHref(toPath, resolved);
  if (relative === null) {
    return null;
  }
  const next = appendFragment(relative, fragmentOf(href));
  if (!isProducedHref(next)) {
    return null;
  }
  return next;
}

function setHref(source: string, element: ParseElement, href: string): Edit {
  const replaced = replaceAttributeValue(source, element, 'href', href);
  if (replaced !== null) {
    return replaced;
  }
  return must(insertBeforeEnd(source, element, ` href="${escapeAttr(href)}"`));
}

function isThemeHref(value: string): boolean {
  let rest = value.trim();
  while (rest.startsWith('../')) {
    rest = rest.slice(3);
  }
  return rest === THEME_FILE;
}

function sameId(left: string, right: string): boolean {
  return left.toUpperCase() === right.toUpperCase();
}

function parseSource(html: string): { bom: boolean; source: string; document: ParseDocument } {
  const bom = html.startsWith('\uFEFF');
  const source = bom ? html.slice(1) : html;
  try {
    return {
      bom,
      source,
      document: parse(source, { scriptingEnabled: false, sourceCodeLocationInfo: true }),
    };
  } catch {
    throw new GavetaError('E_HTML_INVALID');
  }
}

function finish(bom: boolean, source: string, edits: readonly Edit[]): string {
  const next = applyEdits(source, edits);
  return bom ? `\uFEFF${next}` : next;
}

function walk(document: ParseDocument, visit: (element: ParseElement) => void): void {
  const stack: ParseChild[] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || !isElement(node)) {
      continue;
    }
    visit(node);
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = node.childNodes[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
}

function attr(element: ParseElement, name: string): string | null {
  const target = name.toLowerCase();
  for (const attribute of element.attrs) {
    if (attribute.name.toLowerCase() !== target) {
      continue;
    }
    const text = attribute.value.trim();
    return text.length === 0 ? null : text;
  }
  return null;
}

function replaceAttributeValue(
  source: string,
  element: ParseElement,
  name: string,
  value: string,
): Edit | null {
  const span = element.sourceCodeLocation?.attrs?.[name];
  if (span === undefined) {
    return null;
  }
  const raw = source.slice(span.startOffset, span.endOffset);
  const eq = raw.indexOf('=');
  if (eq === -1) {
    return { start: span.startOffset, end: span.endOffset, text: `${name}="${escapeAttr(value)}"` };
  }
  let cursor = eq + 1;
  while (cursor < raw.length && isSpace(raw[cursor])) {
    cursor += 1;
  }
  const quote = raw[cursor];
  if (quote !== '"' && quote !== "'") {
    return { start: span.startOffset, end: span.endOffset, text: `${name}="${escapeAttr(value)}"` };
  }
  const valueStart = span.startOffset + cursor + 1;
  const valueEnd = source[span.endOffset - 1] === quote ? span.endOffset - 1 : span.endOffset;
  return { start: valueStart, end: valueEnd, text: escapeAttr(value) };
}

function deleteAttribute(element: ParseElement, name: string): Edit | null {
  const span = element.sourceCodeLocation?.attrs?.[name];
  if (span === undefined) {
    return null;
  }
  return { start: span.startOffset, end: span.endOffset, text: '' };
}

function insertBeforeEnd(source: string, element: ParseElement, text: string): Edit | null {
  const startTag = element.sourceCodeLocation?.startTag;
  if (startTag === undefined) {
    return null;
  }
  const end = startTag.endOffset;
  const closer = source[end - 1];
  if (end < 1 || end > source.length || closer !== '>') {
    return null;
  }
  return { start: end - 1, end: end - 1, text };
}

function applyEdits(html: string, edits: readonly Edit[]): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
  let next = html;
  let cursor = html.length;
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end > cursor || edit.start > edit.end) {
      throw new GavetaError('E_HTML_INVALID');
    }
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
    cursor = edit.start;
  }
  return next;
}

function must(edit: Edit | null): Edit {
  if (edit === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return edit;
}

function isSpace(character: string | undefined): boolean {
  return character === ' ' || character === '\n' || character === '\t' || character === '\r';
}

function isElement(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}
