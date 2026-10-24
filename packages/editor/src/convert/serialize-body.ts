import type { JSONContent } from '@tiptap/core';
import { renderAttrString, type HtmlAttrMap } from '../attrs.ts';
import { HTML_BLOCK_NODE } from '../html-block.ts';
import { nodeNameToTag, tagToNodeName } from '../names.ts';

const VOID_TAGS = new Set(['hr', 'br', 'img', 'input']);
const TEXT_BLOCKS = new Set([
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

function isAttrRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readGavetaAttrs(node: JSONContent): HtmlAttrMap {
  const attrs = node.attrs;
  if (!isAttrRecord(attrs)) {
    return {};
  }
  const raw = attrs.gavetaAttrs;
  if (!isAttrRecord(raw)) {
    return {};
  }
  const mapped: HtmlAttrMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      mapped[key] = value;
    }
  }
  return mapped;
}

function renderOpenTag(tag: string, attrs: HtmlAttrMap, voidElement = false): string {
  const suffix = voidElement ? ' /' : '';
  return `<${tag}${renderAttrString(attrs)}${suffix}>`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializeText(node: JSONContent): string {
  const text = escapeText(node.text ?? '');
  const marks = node.marks;
  if (marks === undefined || marks.length === 0) {
    return text;
  }
  let wrapped = text;
  for (const mark of marks) {
    if (typeof mark.type !== 'string') {
      continue;
    }
    const tag = nodeNameToTag(mark.type);
    wrapped = `${renderOpenTag(tag, readGavetaAttrs(mark))}${wrapped}</${tag}>`;
  }
  return wrapped;
}

function serializeInlineNodes(nodes: readonly JSONContent[] | undefined): string {
  if (nodes === undefined) {
    return '';
  }
  let html = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      html += serializeText(node);
      continue;
    }
    html += serializeInlineElement(node);
  }
  return html;
}

function serializeInlineElement(node: JSONContent): string {
  const tag = nodeNameToTag(node.type ?? '');
  const attrs = readGavetaAttrs(node);
  if (VOID_TAGS.has(tag)) {
    return renderOpenTag(tag, attrs, true);
  }
  if (tag === 'code') {
    return `${renderOpenTag(tag, attrs)}${serializeInlineNodes(node.content)}</${tag}>`;
  }
  return serializeBlock(node);
}

function readGavetaOuter(node: JSONContent): string | null {
  const attrs = node.attrs;
  if (!isAttrRecord(attrs)) {
    return null;
  }
  const outer = attrs.gavetaOuter;
  return typeof outer === 'string' ? outer : null;
}

function readGavetaDirty(node: JSONContent): boolean {
  const attrs = node.attrs;
  if (!isAttrRecord(attrs)) {
    return false;
  }
  return attrs.gavetaDirty === true;
}

function serializeBlock(node: JSONContent): string {
  if (node.type === HTML_BLOCK_NODE) {
    const attrs = node.attrs;
    const html = isAttrRecord(attrs) ? attrs.html : undefined;
    return typeof html === 'string' ? html : '';
  }

  const preserved = readGavetaOuter(node);
  if (preserved !== null && !readGavetaDirty(node)) {
    return preserved;
  }

  const tag = nodeNameToTag(node.type ?? '');
  const attrs = readGavetaAttrs(node);

  const inlineLi = isAttrRecord(node.attrs) && node.attrs.gavetaInlineLi === true;
  if (tag === 'li' && inlineLi) {
    const inner = node.content?.[0];
    const inline =
      inner?.type === tagToNodeName('p')
        ? serializeInlineNodes(inner.content)
        : serializeBlockNodes(node.content);
    return `${renderOpenTag(tag, attrs)}${inline}</${tag}>`;
  }

  if (VOID_TAGS.has(tag)) {
    return renderOpenTag(tag, attrs, true);
  }

  if (TEXT_BLOCKS.has(tag)) {
    return `${renderOpenTag(tag, attrs)}${serializeInlineNodes(node.content)}</${tag}>`;
  }

  if (tag === 'pre') {
    return `${renderOpenTag(tag, attrs)}${serializeInlineNodes(node.content)}</${tag}>`;
  }

  if (tag === 'code') {
    return `${renderOpenTag(tag, attrs)}${serializeInlineNodes(node.content)}</${tag}>`;
  }

  return `${renderOpenTag(tag, attrs)}${serializeBlockNodes(node.content)}</${tag}>`;
}

function serializeBlockNodes(nodes: readonly JSONContent[] | undefined): string {
  if (nodes === undefined) {
    return '';
  }
  let html = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      html += serializeText(node);
      continue;
    }
    html += serializeBlock(node);
  }
  return html;
}

export function serializeDocJsonToBodyInnerHtml(doc: JSONContent): string {
  return serializeBlockNodes(doc.content);
}
