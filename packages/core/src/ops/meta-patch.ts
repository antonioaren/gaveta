import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { DOCUMENT_SHELL } from '../contract.ts';
import { GavetaError } from '../errors.ts';
import { escapeAttr } from '../links/path.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];

const [TAGS_META, ALIASES_META] = DOCUMENT_SHELL.optionalMeta;

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Replace optional `gaveta:tags` / `gaveta:aliases` meta tags. `undefined` leaves a field unchanged. */
export function patchOptionalMeta(
  html: string,
  tags: readonly string[] | undefined,
  aliases: readonly string[] | undefined,
): string {
  if (tags === undefined && aliases === undefined) {
    return html;
  }
  const parsed = parseSource(html);
  const edits: Edit[] = [];
  const head = findHead(parsed.document);
  if (head === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  if (tags !== undefined) {
    applyMetaField(parsed.source, head, TAGS_META, tags, edits);
  }
  if (aliases !== undefined) {
    applyMetaField(parsed.source, head, ALIASES_META, aliases, edits);
  }
  const next = applyEdits(parsed.source, edits);
  return parsed.bom ? `\uFEFF${next}` : next;
}

function applyMetaField(
  source: string,
  head: ParseElement,
  name: string,
  values: readonly string[],
  edits: Edit[],
): void {
  const existing = findMeta(head, name);
  if (values.length === 0) {
    if (existing !== null) {
      edits.push(removeNode(existing));
    }
    return;
  }
  const content = values.join(', ');
  if (existing === null) {
    const insertAt = headEndOffset(head);
    edits.push({
      start: insertAt,
      end: insertAt,
      text: `<meta name="${name}" content="${escapeAttr(content)}">`,
    });
    return;
  }
  const replaced = replaceAttributeValue(source, existing, 'content', content);
  if (replaced === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  edits.push(replaced);
}

function findHead(document: ParseDocument): ParseElement | null {
  for (const child of document.childNodes) {
    if (!isElement(child) || child.tagName !== 'html') {
      continue;
    }
    for (const grand of child.childNodes) {
      if (isElement(grand) && grand.tagName === 'head') {
        return grand;
      }
    }
  }
  return null;
}

function findMeta(head: ParseElement, name: string): ParseElement | null {
  for (const child of head.childNodes) {
    if (!isElement(child) || child.tagName !== 'meta') {
      continue;
    }
    const metaName = attr(child, 'name');
    if (metaName === name) {
      return child;
    }
  }
  return null;
}

function headEndOffset(head: ParseElement): number {
  const end = head.sourceCodeLocation?.endTag?.startOffset;
  if (end === undefined) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return end;
}

function removeNode(element: ParseElement): Edit {
  const start = element.sourceCodeLocation?.startOffset;
  const end =
    element.sourceCodeLocation?.endTag?.endOffset ?? element.sourceCodeLocation?.endOffset;
  if (start === undefined || end === undefined) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return { start, end, text: '' };
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

function applyEdits(source: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let next = source;
  for (const edit of ordered) {
    next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
  }
  return next;
}

function isElement(node: ParseChild): node is ParseElement {
  return node.nodeName !== '#text' && node.nodeName !== '#comment' && 'tagName' in node;
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
    return null;
  }
  const quote = raw[eq + 1];
  if (quote !== '"' && quote !== "'") {
    return null;
  }
  const close = raw.lastIndexOf(quote);
  if (close <= eq + 1) {
    return null;
  }
  const next = `${raw.slice(0, eq + 2)}${escapeAttr(value)}${quote}`;
  return { start: span.startOffset, end: span.endOffset, text: next };
}
