import { parse, serializeOuter } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { JSONContent } from '@tiptap/core';
import { readElementAttrs } from '../attrs.ts';
import { elementKind, isContractBodyTag, MARK_TAGS } from '../element-kind.ts';
import { HTML_BLOCK_NODE } from '../html-block.ts';
import { tagToNodeName } from '../names.ts';
import { outerHtmlFromSource, textFromSource } from './source-slice.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseText = DefaultTreeAdapterMap['textNode'];

function isElement(node: ParseChild): node is ParseElement {
  return node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#document';
}

function isText(node: ParseChild): node is ParseText {
  return node.nodeName === '#text';
}

function liChildrenAreInlineOnly(children: readonly ParseChild[]): boolean {
  for (const child of children) {
    if (isText(child)) {
      continue;
    }
    if (!isElement(child)) {
      return false;
    }
    const kind = elementKind(child.tagName);
    if (kind === 'mark' || kind === 'inlineAtom' || child.tagName === 'code') {
      continue;
    }
    return false;
  }
  return true;
}

function blockAttrs(element: ParseElement, source: string | null): Record<string, unknown> {
  const attrs: Record<string, unknown> = { gavetaAttrs: readElementAttrs(element) };
  if (source !== null) {
    const outer = outerHtmlFromSource(source, element);
    if (outer !== null) {
      attrs.gavetaOuter = outer;
    }
  }
  return attrs;
}

function textNode(value: string, marks: readonly JSONContent[]): JSONContent {
  const node: JSONContent = { type: 'text', text: value };
  if (marks.length > 0) {
    node.marks = marks.flatMap((mark) => {
      if (typeof mark.type !== 'string') {
        return [];
      }
      const entry: { type: string; attrs?: Record<string, unknown> } = { type: mark.type };
      if (mark.attrs !== undefined) {
        entry.attrs = mark.attrs;
      }
      return [entry];
    });
  }
  return node;
}

function markFromElement(element: ParseElement): JSONContent {
  return {
    type: tagToNodeName(element.tagName),
    attrs: { gavetaAttrs: readElementAttrs(element) },
  };
}

function convertInlineChildren(
  children: readonly ParseChild[],
  activeMarks: readonly JSONContent[],
  source: string | null,
): JSONContent[] {
  const nodes: JSONContent[] = [];
  for (const child of children) {
    if (isText(child)) {
      if (child.value.length > 0) {
        nodes.push(textNode(child.value, activeMarks));
      }
      continue;
    }
    if (!isElement(child)) {
      continue;
    }
    const tag = child.tagName;
    if (MARK_TAGS.has(tag)) {
      const nextMarks = [...activeMarks, markFromElement(child)];
      nodes.push(...convertInlineChildren(child.childNodes, nextMarks, source));
      continue;
    }
    if (tag === 'code') {
      nodes.push({
        type: tagToNodeName('code'),
        attrs: blockAttrs(child, source),
        content: convertInlineChildren(child.childNodes, [], source),
      });
      continue;
    }
    if (elementKind(tag) === 'inlineAtom') {
      nodes.push({
        type: tagToNodeName(tag),
        attrs: blockAttrs(child, source),
      });
      continue;
    }
    nodes.push(htmlBlockFromElement(child));
  }
  return nodes;
}

function htmlBlockFromElement(element: ParseElement, source: string | null = null): JSONContent {
  const outer = source === null ? null : outerHtmlFromSource(source, element);
  return {
    type: HTML_BLOCK_NODE,
    attrs: { html: outer ?? serializeOuter(element) },
  };
}

function convertBlockElement(
  element: ParseElement,
  source: string | null,
  bodyEnd: number | null,
): JSONContent {
  const tag = element.tagName;
  if (!isContractBodyTag(tag)) {
    return htmlBlockFromElement(element, source);
  }

  if (tag === 'li' && liChildrenAreInlineOnly(element.childNodes)) {
    return {
      type: tagToNodeName('li'),
      attrs: {
        ...blockAttrs(element, source),
        gavetaInlineLi: true,
      },
      content: [
        {
          type: tagToNodeName('p'),
          attrs: { gavetaAttrs: {} },
          content: convertInlineChildren(element.childNodes, [], source),
        },
      ],
    };
  }

  const kind = elementKind(tag);
  if (kind === 'textBlock' || kind === 'voidBlock') {
    return {
      type: tagToNodeName(tag),
      attrs: blockAttrs(element, source),
      ...(kind === 'textBlock'
        ? { content: convertInlineChildren(element.childNodes, [], source) }
        : {}),
    };
  }

  return {
    type: tagToNodeName(tag),
    attrs: blockAttrs(element, source),
    content: convertBlockChildren(element.childNodes, source, bodyEnd),
  };
}

function whitespaceBlock(
  child: ParseText,
  source: string | null,
  bodyEnd: number | null,
): JSONContent | null {
  if (source === null) {
    if (child.value.length === 0) {
      return null;
    }
    return { type: HTML_BLOCK_NODE, attrs: { html: child.value } };
  }
  const slice = textFromSource(source, child, bodyEnd);
  if (slice === null || slice.length === 0) {
    return null;
  }
  return { type: HTML_BLOCK_NODE, attrs: { html: slice } };
}

function bodyEndOffset(body: ParseElement): number | null {
  const location: unknown = body.sourceCodeLocation;
  if (location === null || typeof location !== 'object') {
    return null;
  }
  const endTag = (location as { endTag?: { startOffset?: number } }).endTag?.startOffset;
  return endTag ?? null;
}

function convertBlockChildren(
  children: readonly ParseChild[],
  source: string | null,
  bodyEnd: number | null = null,
): JSONContent[] {
  const nodes: JSONContent[] = [];
  for (const child of children) {
    if (isText(child)) {
      const block = whitespaceBlock(child, source, bodyEnd);
      if (block !== null) {
        nodes.push(block);
      } else if (child.value.trim().length > 0) {
        nodes.push(textNode(child.value, []));
      }
      continue;
    }
    if (!isElement(child)) {
      continue;
    }
    const tag = child.tagName;
    const kind = elementKind(tag);
    if (kind === 'mark' || kind === 'inlineAtom' || tag === 'code') {
      nodes.push({
        type: tagToNodeName('p'),
        attrs: { gavetaAttrs: {} },
        content: convertInlineChildren([child], [], source),
      });
      continue;
    }
    if (!isContractBodyTag(tag)) {
      nodes.push(htmlBlockFromElement(child, source));
      continue;
    }
    nodes.push(convertBlockElement(child, source, bodyEnd));
  }
  return nodes;
}

function findBody(document: ParseDocument): ParseElement | null {
  for (const child of document.childNodes) {
    if (!isElement(child) || child.tagName !== 'html') {
      continue;
    }
    for (const inner of child.childNodes) {
      if (isElement(inner) && inner.tagName === 'body') {
        return inner;
      }
    }
  }
  return null;
}

export function parseBodyElementToDocJson(body: ParseElement, source: string): JSONContent {
  const content = convertBlockChildren(body.childNodes, source, bodyEndOffset(body));
  return { type: 'doc', content };
}

export function parseBodyHtmlToDocJson(bodyHtml: string): JSONContent {
  const fragment = parse(`<body>${bodyHtml}</body>`, {
    scriptingEnabled: false,
    sourceCodeLocationInfo: true,
  });
  const body = findBody(fragment);
  if (body === null) {
    return { type: 'doc', content: [] };
  }
  const content = convertBlockChildren(body.childNodes, null);
  return { type: 'doc', content };
}
