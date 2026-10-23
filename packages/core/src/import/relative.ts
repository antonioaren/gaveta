import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { escapeAttr, escapeText, relativeNoteHref } from '../links/path.ts';
import { resolveSourceMdHref } from './exclude.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];

export interface ImportedMdTarget {
  readonly id: string;
  readonly path: string;
  readonly title: string;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function rewriteImportedMarkdownLinks(options: {
  readonly html: string;
  readonly fromVaultPath: string;
  readonly fromSourceMd: string;
  readonly lookupSourceMd: (sourceMd: string) => ImportedMdTarget | null;
  readonly sectionFor: (targetPath: string, rawSection: string | null) => string | null;
}): string {
  const bom = options.html.startsWith('\uFEFF');
  const source = bom ? options.html.slice(1) : options.html;
  const edits: Edit[] = [];
  let document: ParseDocument;
  try {
    document = parse(source, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  } catch {
    return options.html;
  }
  const body = findBody(document);
  if (body !== null) {
    walk(body, source, options, edits);
  }
  if (edits.length === 0) {
    return options.html;
  }
  edits.sort((left, right) => right.start - left.start);
  let result = source;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return bom ? `\uFEFF${result}` : result;
}

function walk(
  node: ParseChild,
  source: string,
  options: {
    readonly fromVaultPath: string;
    readonly fromSourceMd: string;
    readonly lookupSourceMd: (sourceMd: string) => ImportedMdTarget | null;
    readonly sectionFor: (targetPath: string, rawSection: string | null) => string | null;
  },
  edits: Edit[],
): void {
  if (
    node.nodeName === '#text' ||
    node.nodeName === '#comment' ||
    node.nodeName === '#documentType'
  ) {
    return;
  }
  const element = node as ParseElement;
  if (element.tagName.toLowerCase() === 'a') {
    rewriteAnchor(element, options, edits);
  }
  for (const child of element.childNodes) {
    walk(child, source, options, edits);
  }
}

function rewriteAnchor(
  element: ParseElement,
  options: {
    readonly fromVaultPath: string;
    readonly fromSourceMd: string;
    readonly lookupSourceMd: (sourceMd: string) => ImportedMdTarget | null;
    readonly sectionFor: (targetPath: string, rawSection: string | null) => string | null;
  },
  edits: Edit[],
): void {
  const href = attr(element, 'href');
  if (href === null || trimmed(href).length === 0) {
    return;
  }
  const trimmedHref = trimmed(href);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedHref) || trimmedHref.startsWith('//')) {
    return;
  }
  const fragmentIndex = trimmedHref.indexOf('#');
  const pathPart = fragmentIndex === -1 ? trimmedHref : trimmedHref.slice(0, fragmentIndex);
  const rawFragment = fragmentIndex === -1 ? null : trimmedHref.slice(fragmentIndex + 1);
  if (!pathPart.toLowerCase().endsWith('.md')) {
    return;
  }
  const sourceMd = resolveSourceMdHref(options.fromSourceMd, trimmedHref);
  if (sourceMd === null) {
    return;
  }
  const target = options.lookupSourceMd(sourceMd);
  if (target === null) {
    return;
  }
  const section = options.sectionFor(target.path, rawFragment);
  const relative = relativeNoteHref(options.fromVaultPath, target.path);
  if (relative === null) {
    return;
  }
  const hrefValue = section === null ? relative : `${relative}#${section}`;
  const text = elementText(element);
  const location = element.sourceCodeLocation;
  if (location === undefined || location === null) {
    return;
  }
  edits.push({
    start: location.startOffset,
    end: location.endOffset,
    text: `<a href="${escapeAttr(hrefValue)}" data-g-to="${escapeAttr(target.id)}">${escapeText(text)}</a>`,
  });
}

function findBody(document: ParseDocument): ParseElement | null {
  for (const child of document.childNodes) {
    if (child.nodeName !== 'html') {
      continue;
    }
    const html = asElement(child);
    if (html === null) {
      continue;
    }
    for (const grand of html.childNodes) {
      if (grand.nodeName !== 'body') {
        continue;
      }
      const body = asElement(grand);
      if (body !== null) {
        return body;
      }
    }
  }
  return null;
}

function asElement(node: ParseChild): ParseElement | null {
  if (
    node.nodeName === '#text' ||
    node.nodeName === '#comment' ||
    node.nodeName === '#documentType'
  ) {
    return null;
  }
  return node as ParseElement;
}

function attr(element: ParseElement, name: string): string | null {
  for (const attribute of element.attrs) {
    if (attribute.name.toLowerCase() === name) {
      return attribute.value;
    }
  }
  return null;
}

function trimmed(value: string): string {
  return value.trim();
}

function elementText(element: ParseElement): string {
  const parts: string[] = [];
  walkText(element, parts);
  return parts.join('');
}

function walkText(node: ParseChild, parts: string[]): void {
  if (node.nodeName === '#text') {
    parts.push((node as DefaultTreeAdapterMap['textNode']).value);
    return;
  }
  if (node.nodeName === '#comment' || node.nodeName === '#documentType') {
    return;
  }
  const element = node as ParseElement;
  for (const child of element.childNodes) {
    walkText(child, parts);
  }
}
