import { isUlid } from '../contract.ts';
import { GavetaError } from '../errors.ts';
import { escapeAttr, escapeText, isProducedHref, resolveVaultHref } from '../links/path.ts';
import { GavetaRefError, notesForId, refCandidates } from '../links/ref.ts';
import { suggestNotes } from '../links/suggest.ts';
import {
  MERMAID_BOOT_BASENAME,
  MERMAID_MIN_BASENAME,
  MERMAID_BOOT_ROLE,
  MERMAID_LIB_ROLE,
  MERMAID_SCRIPT_ATTR,
} from '../mermaid/assets.ts';
import type { NoteType } from '../contract.ts';
import { normalizeNote } from '../normalize.ts';
import { parseNote } from '../parser.ts';
import { buildRenderTypeLayout } from './type-views.ts';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { serializeOuter } from 'parse5';
import { expandEmbedsInRenderBody } from '../links/embeds.ts';
import { readVaultText } from '../vault/paths.ts';
import type { Locale } from '@gaveta/i18n';
import type { IndexedNote, VaultIndex } from '../sqlite/store.ts';

type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseChild = DefaultTreeAdapterMap['childNode'];

function serializeChild(child: ParseChild): string {
  return serializeOuter(child);
}

const CSP_HTTP_EQUIV = 'content-security-policy';

export const RENDER_STATIC_PREFIX = '/render/static';
export const RENDER_NOTE_FILE_PREFIX = '/render';

export interface BuildNoteRenderPageInput {
  readonly noteId: string;
  readonly notePath: string;
  readonly title: string;
  readonly sourceHtml: string;
  readonly port: number;
  readonly renderTicket: string;
  readonly remoteAllowlist: readonly string[];
}

export interface BuildNoteRenderPageWithEmbedsInput extends BuildNoteRenderPageInput {
  readonly vaultRoot: string;
  readonly index: VaultIndex;
  readonly locale: Locale;
}

export function appendRenderTicketQuery(path: string, ticket: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}t=${encodeURIComponent(ticket)}`;
}

export function readRenderNoteId(raw: string): string {
  if (typeof raw !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const trimmed = raw.trim();
  if (!isUlid(trimmed)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return trimmed;
}

export function resolveRenderNote(index: VaultIndex, id: string): IndexedNote {
  const noteId = readRenderNoteId(id);
  const matches = notesForId(index, noteId);
  if (matches.length === 0) {
    throw new GavetaRefError('E_REF_NOT_FOUND', {}, { suggestions: suggestNotes(index, noteId) });
  }
  if (matches.length > 1) {
    throw new GavetaRefError('E_REF_AMBIGUOUS', {}, { candidates: refCandidates(matches) });
  }
  const note = matches[0];
  if (note === undefined || note.id === null) {
    throw new GavetaError('E_META_MISSING');
  }
  return note;
}

const SERVE_HOST = '127.0.0.1';

export function buildNoteRenderCsp(port: number): string {
  const origin = `http://${SERVE_HOST}:${String(port)}`;
  return [
    "default-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    `style-src 'self' ${origin} 'unsafe-inline'`,
    `img-src 'self' ${origin} data:`,
    `font-src 'self' ${origin}`,
    `script-src 'self' ${origin}`,
    "connect-src 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

export async function buildNoteRenderPageWithEmbeds(
  input: BuildNoteRenderPageWithEmbedsInput,
): Promise<string> {
  const normalized = normalizeNote(input.sourceHtml, {
    notePath: input.notePath,
    remoteAllowlist: input.remoteAllowlist,
  });
  if (!normalized.ok || normalized.html === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const bodyInner = extractBodyInner(normalized.html);
  const ticket = input.renderTicket;
  const expanded = await expandEmbedsInRenderBody(bodyInner, {
    hostNoteId: input.noteId,
    hostNotePath: input.notePath,
    index: input.index,
    vaultRoot: input.vaultRoot,
    remoteAllowlist: input.remoteAllowlist,
    chain: [input.noteId],
    depth: 0,
    rewriteAssets: (html, noteId, notePath) => rewriteAssetUrls(html, noteId, notePath, ticket),
    loadNoteHtml: (path) => readVaultText(input.vaultRoot, path),
    locale: input.locale,
  });
  const rewritten = rewriteAssetUrls(expanded, input.noteId, input.notePath, ticket);
  return assembleNoteRenderPage(input, normalized.html, rewritten);
}

export function buildNoteRenderPage(input: BuildNoteRenderPageInput): string {
  const normalized = normalizeNote(input.sourceHtml, {
    notePath: input.notePath,
    remoteAllowlist: input.remoteAllowlist,
  });
  if (!normalized.ok || normalized.html === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const bodyInner = extractBodyInner(normalized.html);
  const ticket = input.renderTicket;
  const rewritten = rewriteAssetUrls(bodyInner, input.noteId, input.notePath, ticket);
  return assembleNoteRenderPage(input, normalized.html, rewritten);
}

function assembleNoteRenderPage(
  input: BuildNoteRenderPageInput,
  normalizedHtml: string,
  rewrittenBody: string,
): string {
  const noteType = readRenderNoteType(normalizedHtml);
  const layout = buildRenderTypeLayout(noteType, rewrittenBody);
  const csp = buildNoteRenderCsp(input.port);
  const title = escapeText(input.title);
  const ticket = input.renderTicket;
  const staticUrl = (basename: string): string =>
    appendRenderTicketQuery(`${RENDER_STATIC_PREFIX}/${basename}`, ticket);
  const headParts = [
    '<!doctype html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta name="gaveta:type" content="${escapeAttr(noteType)}">`,
    `<meta http-equiv="${CSP_HTTP_EQUIV}" content="${escapeAttr(csp)}">`,
    `<title>${title}</title>`,
    `<link rel="stylesheet" href="${escapeAttr(staticUrl('theme.css'))}">`,
  ];
  if (htmlContainsMermaid(normalizedHtml)) {
    headParts.push(
      `<script defer src="${escapeAttr(staticUrl(MERMAID_MIN_BASENAME))}" ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}"></script>`,
      `<script defer src="${escapeAttr(staticUrl(MERMAID_BOOT_BASENAME))}" ${MERMAID_SCRIPT_ATTR}="${MERMAID_BOOT_ROLE}"></script>`,
    );
  }
  for (const scriptName of layout.scripts) {
    headParts.push(
      `<script defer src="${escapeAttr(staticUrl(scriptName))}" ${MERMAID_SCRIPT_ATTR}="render-view"></script>`,
    );
  }
  headParts.push(
    `<script defer src="${escapeAttr(staticUrl('render-bridge.js'))}" ${MERMAID_SCRIPT_ATTR}="render-bridge"></script>`,
    '</head>',
    '<body>',
    layout.html,
    '</body>',
    '</html>',
  );
  return headParts.join('');
}

function readRenderNoteType(html: string): NoteType {
  const parsed = parseNote(html);
  const type = parsed.note?.type;
  if (type === null || type === undefined) {
    return 'doc';
  }
  return type;
}

function extractBodyInner(html: string): string {
  let document: ParseDocument;
  try {
    document = parse(html, { scriptingEnabled: false });
  } catch {
    throw new GavetaError('E_HTML_INVALID');
  }
  const body = findElement(document, 'body');
  if (body === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return body.childNodes.map((child) => serializeChild(child)).join('');
}

function findElement(node: ParseChild | ParseDocument, tagName: string): ParseElement | null {
  if ('tagName' in node && node.tagName.toLowerCase() === tagName) {
    return node;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const found = findElement(child, tagName);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function rewriteAssetUrls(
  bodyHtml: string,
  noteId: string,
  notePath: string,
  ticket: string,
): string {
  let document: ParseDocument;
  try {
    document = parse(`<body>${bodyHtml}</body>`, {
      scriptingEnabled: false,
      sourceCodeLocationInfo: true,
    });
  } catch {
    return bodyHtml;
  }
  const body = findElement(document, 'body');
  if (body === null) {
    return bodyHtml;
  }
  walkElements(body, (element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio') {
      rewriteMediaSrc(element, 'src', noteId, notePath, ticket);
      if (tag === 'video') {
        rewriteMediaSrc(element, 'poster', noteId, notePath, ticket);
      }
    }
    if (tag === 'a') {
      rewriteAnchorHref(element, noteId, notePath, ticket);
    }
  });
  return body.childNodes.map((child) => serializeChild(child)).join('');
}

function rewriteMediaSrc(
  element: ParseElement,
  attribute: string,
  noteId: string,
  notePath: string,
  ticket: string,
): void {
  const attr = element.attrs.find((entry) => entry.name === attribute);
  if (attr === undefined) {
    return;
  }
  const value = attr.value.trim();
  if (value.length === 0 || value.startsWith('data:') || value.startsWith('/render/')) {
    return;
  }
  if (/^[a-z]+:/iu.test(value)) {
    return;
  }
  const vaultRelative = resolveVaultAttachmentPath(notePath, value);
  if (vaultRelative === null) {
    return;
  }
  const path = `${RENDER_NOTE_FILE_PREFIX}/${noteId}/file/${encodePathSegments(vaultRelative)}`;
  attr.value = appendRenderTicketQuery(path, ticket);
}

function rewriteAnchorHref(
  element: ParseElement,
  noteId: string,
  notePath: string,
  ticket: string,
): void {
  const attr = element.attrs.find((entry) => entry.name === 'href');
  if (attr === undefined) {
    return;
  }
  const value = attr.value.trim();
  if (value.length === 0 || value.startsWith('/render/')) {
    return;
  }
  const vaultRelative = resolveVaultAttachmentPath(notePath, value);
  if (vaultRelative === null) {
    return;
  }
  const path = `${RENDER_NOTE_FILE_PREFIX}/${noteId}/file/${encodePathSegments(vaultRelative)}`;
  attr.value = appendRenderTicketQuery(path, ticket);
}

function resolveVaultAttachmentPath(notePath: string, href: string): string | null {
  if (!isProducedHref(href)) {
    return null;
  }
  const resolved = resolveVaultHref(notePath, href);
  if (resolved === null) {
    return null;
  }
  if (resolved.endsWith('.html') || resolved.endsWith('.md')) {
    return null;
  }
  return resolved;
}

function encodePathSegments(vaultRelative: string): string {
  return vaultRelative
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function htmlContainsMermaid(html: string): boolean {
  let document: ParseDocument;
  try {
    document = parse(html, { scriptingEnabled: false });
  } catch {
    return false;
  }
  let found = false;
  for (const child of document.childNodes) {
    if (!('tagName' in child)) {
      continue;
    }
    walkElements(child, (element) => {
      if (found || element.tagName.toLowerCase() !== 'pre') {
        return;
      }
      const classAttr = element.attrs.find((entry) => entry.name === 'class');
      const classes = classAttr?.value.split(/\s+/u) ?? [];
      if (classes.includes('mermaid')) {
        found = true;
      }
    });
  }
  return found;
}

function walkElements(
  root: ParseElement | ParseDocument,
  visit: (element: ParseElement) => void,
): void {
  const stack: ParseChild[] = [...root.childNodes];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || !('tagName' in current)) {
      continue;
    }
    visit(current);
    for (const child of current.childNodes) {
      stack.push(child);
    }
  }
}
