import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { serializeOuter } from 'parse5';
import { formatMessage } from '@gaveta/i18n';
import { isUlid } from '../contract.ts';
import { normalizeNote } from '../normalize.ts';
import {
  appendFragment,
  escapeAttr,
  escapeText,
  inspectVaultPath,
  relativeNoteHref,
} from './path.ts';
import { notesForId } from './ref.ts';
import type { VaultIndex } from '../sqlite/store.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];

export const MAX_EMBED_DEPTH = 8;

const EMBED_RENDER_LOCALE = 'es';

export interface ExpandEmbedsInRenderBodyOptions {
  readonly hostNoteId: string;
  readonly hostNotePath: string;
  readonly index: VaultIndex;
  readonly vaultRoot: string;
  readonly remoteAllowlist: readonly string[];
  readonly chain: readonly string[];
  readonly depth: number;
  readonly rewriteAssets: (bodyHtml: string, noteId: string, notePath: string) => string;
  readonly loadNoteHtml: (notePath: string) => Promise<string>;
}

export function replaceEmbedsWithLinks(html: string, fromPath: string, index: VaultIndex): string {
  if (!html.includes('gaveta-embed')) {
    return html;
  }
  let document: ParseDocument;
  try {
    document = parse(html, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  } catch {
    return html;
  }
  const replacements: { readonly start: number; readonly end: number; readonly text: string }[] =
    [];
  walkElements(document, (element) => {
    if (element.tagName.toLowerCase() !== 'gaveta-embed') {
      return;
    }
    const location = element.sourceCodeLocation;
    if (location === null || location === undefined) {
      return;
    }
    const targetId = trimmedAttr(element, 'data-g-to');
    const sectionId = trimmedAttr(element, 'data-g-section');
    if (targetId === null || !isUlid(targetId)) {
      return;
    }
    if (sectionId !== null && !isSafeSectionId(sectionId)) {
      replacements.push({
        start: location.startOffset,
        end: location.endOffset,
        text: embedFallbackMarkup('W_EMBED_SECTION_MISSING', { sectionId: 'invalid' }),
      });
      return;
    }
    const target = resolveIndexedNote(index, targetId);
    if (target === null) {
      replacements.push({
        start: location.startOffset,
        end: location.endOffset,
        text: embedFallbackMarkup('W_EMBED_TARGET_MISSING', { targetId }),
      });
      return;
    }
    replacements.push({
      start: location.startOffset,
      end: location.endOffset,
      text: embedLinkMarkup(fromPath, target.path, target.id, target.title, sectionId),
    });
  });
  return applyReplacements(html, replacements);
}

interface EmbedHit {
  readonly start: number;
  readonly end: number;
  readonly targetId: string;
  readonly sectionId: string | null;
}

export async function expandEmbedsInRenderBody(
  bodyHtml: string,
  options: ExpandEmbedsInRenderBodyOptions,
): Promise<string> {
  if (!bodyHtml.includes('gaveta-embed')) {
    return bodyHtml;
  }
  const hits = collectEmbedHits(bodyHtml);
  if (hits.length === 0) {
    return bodyHtml;
  }
  let result = bodyHtml;
  const ordered = [...hits].sort((left, right) => right.start - left.start);
  for (const hit of ordered) {
    const replacement = await resolveEmbedReplacement(hit, options);
    result = result.slice(0, hit.start) + replacement + result.slice(hit.end);
  }
  return result;
}

async function resolveEmbedReplacement(
  hit: EmbedHit,
  options: ExpandEmbedsInRenderBodyOptions,
): Promise<string> {
  if (!isUlid(hit.targetId)) {
    return '';
  }
  if (hit.sectionId !== null && !isSafeSectionId(hit.sectionId)) {
    return embedFallbackMarkup('W_EMBED_SECTION_MISSING', {
      sectionId: 'invalid',
    });
  }
  if (options.chain.includes(hit.targetId)) {
    return embedFallbackMarkup('W_EMBED_CYCLE', { targetId: hit.targetId });
  }
  if (options.depth >= MAX_EMBED_DEPTH) {
    return embedFallbackMarkup('W_EMBED_DEPTH', {});
  }
  const target = resolveIndexedNote(options.index, hit.targetId);
  if (target === null) {
    return embedFallbackMarkup('W_EMBED_TARGET_MISSING', { targetId: hit.targetId });
  }
  const sourceHtml = await options.loadNoteHtml(target.path);
  const normalized = normalizeNote(sourceHtml, {
    notePath: target.path,
    remoteAllowlist: options.remoteAllowlist,
  });
  if (!normalized.ok || normalized.html === null) {
    return embedFallbackMarkup('W_EMBED_TARGET_MISSING', { targetId: hit.targetId });
  }
  const sectionInner = extractSectionInner(normalized.html, hit.sectionId);
  if (sectionInner === null) {
    return embedFallbackMarkup('W_EMBED_SECTION_MISSING', {
      sectionId: hit.sectionId ?? '',
    });
  }
  const nested = await expandEmbedsInRenderBody(sectionInner, {
    ...options,
    hostNoteId: target.id,
    hostNotePath: target.path,
    chain: [...options.chain, hit.targetId],
    depth: options.depth + 1,
  });
  return options.rewriteAssets(nested, target.id, target.path);
}

function collectEmbedHits(bodyHtml: string): EmbedHit[] {
  let document: ParseDocument;
  try {
    document = parse(`<body>${bodyHtml}</body>`, {
      scriptingEnabled: false,
      sourceCodeLocationInfo: true,
    });
  } catch {
    return [];
  }
  const body = findElement(document, 'body');
  if (body === null) {
    return [];
  }
  const bodyInnerStart = body.sourceCodeLocation?.startTag?.endOffset ?? 0;
  const bodyInnerEnd = body.sourceCodeLocation?.endTag?.startOffset ?? bodyHtml.length;
  const hits: EmbedHit[] = [];
  walkElements(body, (element) => {
    if (element.tagName.toLowerCase() !== 'gaveta-embed') {
      return;
    }
    const location = element.sourceCodeLocation;
    if (location === null || location === undefined) {
      return;
    }
    const targetId = trimmedAttr(element, 'data-g-to');
    if (targetId === null) {
      return;
    }
    const start = location.startOffset - bodyInnerStart;
    const end = location.endOffset - bodyInnerStart;
    if (start < 0 || end > bodyInnerEnd - bodyInnerStart) {
      return;
    }
    hits.push({
      start,
      end,
      targetId,
      sectionId: trimmedAttr(element, 'data-g-section'),
    });
  });
  return hits;
}

function embedLinkMarkup(
  fromPath: string,
  toPath: string,
  toId: string,
  title: string,
  sectionId: string | null,
): string {
  const relative = relativeNoteHref(fromPath, toPath);
  if (relative === null) {
    return embedFallbackMarkup('W_EMBED_TARGET_MISSING', { targetId: toId });
  }
  const href = sectionId === null ? relative : appendFragment(relative, sectionId);
  return `<p><a href="${escapeAttr(href)}" data-g-to="${escapeAttr(toId)}">${escapeText(title)}</a></p>`;
}

function embedFallbackMarkup(
  code: 'W_EMBED_CYCLE' | 'W_EMBED_DEPTH' | 'W_EMBED_TARGET_MISSING' | 'W_EMBED_SECTION_MISSING',
  params: Record<string, string>,
): string {
  const message = formatMessage(`diagnostics.${code}.message`, EMBED_RENDER_LOCALE, params);
  return `<aside class="callout gaveta-embed-fallback" data-kind="warn" data-g-code="${code}"><p>${escapeText(message)}</p></aside>`;
}

function resolveIndexedNote(
  index: VaultIndex,
  id: string,
): { readonly id: string; readonly path: string; readonly title: string } | null {
  const matches = notesForId(index, id);
  if (matches.length !== 1) {
    return null;
  }
  const note = matches[0];
  if (note === undefined || note.id === null) {
    return null;
  }
  return { id: note.id, path: note.path, title: note.title };
}

function extractSectionInner(html: string, sectionId: string | null): string | null {
  let document: ParseDocument;
  try {
    document = parse(html, { scriptingEnabled: false });
  } catch {
    return null;
  }
  const article = findElement(document, 'article');
  if (article === null) {
    return null;
  }
  if (sectionId === null) {
    return article.childNodes.map((child) => serializeChild(child)).join('');
  }
  const sectionElement = findSectionElement(article, sectionId);
  if (sectionElement === null) {
    return null;
  }
  return sectionElement.childNodes.map((child) => serializeChild(child)).join('');
}

function findSectionElement(article: ParseElement, sectionId: string): ParseElement | null {
  let match: ParseElement | null = null;
  walkElements(article, (element) => {
    if (match !== null) {
      return;
    }
    if (element.tagName.toLowerCase() === 'section' && trimmedAttr(element, 'id') === sectionId) {
      match = element;
    }
  });
  return match;
}

function isSafeSectionId(value: string): boolean {
  if (value.length === 0 || value.length > 120) {
    return false;
  }
  const inspected = inspectVaultPath(value);
  if (!inspected.ok) {
    return false;
  }
  return inspected.path === value && !value.includes('..');
}

function trimmedAttr(element: ParseElement, name: string): string | null {
  const attr = element.attrs.find((entry) => entry.name === name);
  if (attr === undefined) {
    return null;
  }
  const trimmed = attr.value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function applyReplacements(
  html: string,
  replacements: readonly { readonly start: number; readonly end: number; readonly text: string }[],
): string {
  if (replacements.length === 0) {
    return html;
  }
  const ordered = [...replacements].sort((left, right) => right.start - left.start);
  let result = html;
  for (const replacement of ordered) {
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  }
  return result;
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

function serializeChild(child: ParseChild): string {
  return serializeOuter(child);
}
