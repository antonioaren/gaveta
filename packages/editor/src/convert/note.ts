import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { parseBodyElementToDocJson, parseBodyHtmlToDocJson } from './parse-body.ts';
import { serializeDocJsonToBodyInnerHtml } from './serialize-body.ts';
import type { GavetaEditorDocument } from './types.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];

interface TagLocation {
  readonly startTag?: { readonly endOffset: number };
  readonly endTag?: { readonly startOffset: number };
}

function isElement(node: ParseChild): node is ParseElement {
  return node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#document';
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

function readBodySlice(
  html: string,
  body: ParseElement,
): { beforeBody: string; afterBody: string; bodyInner: string } {
  const location: unknown = body.sourceCodeLocation;
  if (location === null || typeof location !== 'object') {
    throw new Error('E_EDITOR_BODY_LOCATION');
  }
  const tagLocation = location as TagLocation;
  const start = tagLocation.startTag?.endOffset;
  const end = tagLocation.endTag?.startOffset;
  if (start === undefined || end === undefined || start > end) {
    throw new Error('E_EDITOR_BODY_LOCATION');
  }
  return {
    beforeBody: html.slice(0, start),
    afterBody: html.slice(end),
    bodyInner: html.slice(start, end),
  };
}

export function noteHtmlToEditorDocument(html: string): GavetaEditorDocument {
  const document = parse(html, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  const body = findBody(document);
  if (body === null) {
    const bodyDoc = parseBodyHtmlToDocJson(html);
    return { beforeBody: '', afterBody: '', body: bodyDoc };
  }
  const slices = readBodySlice(html, body);
  const bodyDoc = parseBodyElementToDocJson(body, html);
  return {
    beforeBody: slices.beforeBody,
    afterBody: slices.afterBody,
    body: bodyDoc,
  };
}

export function editorDocumentToNoteHtml(document: GavetaEditorDocument): string {
  const inner = serializeDocJsonToBodyInnerHtml(document.body);
  return `${document.beforeBody}${inner}${document.afterBody}`;
}

export function noteHtmlToEditorJson(html: string): GavetaEditorDocument {
  return noteHtmlToEditorDocument(html);
}

export function editorJsonToNoteHtml(document: GavetaEditorDocument): string {
  return editorDocumentToNoteHtml(document);
}

export function roundTripNoteHtml(html: string): string {
  return editorJsonToNoteHtml(noteHtmlToEditorJson(html));
}
