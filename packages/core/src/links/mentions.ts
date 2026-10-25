import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { GavetaError } from '../errors.ts';
import { BACKLINK_CONTEXT_LIMIT } from '../graph.ts';
import { noteContentHash } from '../notes.ts';
import { MAX_NOTE_DEPTH } from '../parser.ts';
import { foldMatchKey, type VaultIndex } from '../sqlite/store.ts';
import { openVaultIndex } from '../sqlite/store.ts';
import { validateNote } from '../validate.ts';
import { readVaultConfig } from '../vault/config.ts';
import { readVaultText, writeVaultText } from '../vault/paths.ts';
import { resolveRef } from './ref.ts';
import { resolveNoteLinks } from './rewrite.ts';
import {
  escapeAttr,
  escapeText,
  inspectVaultPath,
  isProducedHref,
  relativeNoteHref,
} from './path.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseText = DefaultTreeAdapterMap['textNode'];

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface MentionPhrase {
  readonly phrase: string;
  readonly folded: string;
  readonly matchedBy: 'title' | 'alias';
}

export interface UnlinkedMention {
  readonly sourcePath: string;
  readonly sourceId: string | null;
  readonly sourceTitle: string;
  readonly text: string;
  readonly phrase: string;
  readonly matchedBy: 'title' | 'alias';
  readonly context: string;
  readonly position: number;
}

export interface MentionTarget {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly aliases: readonly string[];
}

interface DecodedSlice {
  readonly decoded: string;
  readonly rawStart: readonly number[];
  readonly rawEnd: number;
}

const LINK_KEYS = ['vaultRoot', 'ref', 'from', 'ifMatches', 'onlyPaths'] as const;

export async function unlinkedMentions(
  vaultRoot: string,
  index: VaultIndex,
  ref: string,
): Promise<UnlinkedMention[]> {
  const target = resolveTarget(index, ref);
  const phrases = buildPhrases(target);
  const result: UnlinkedMention[] = [];
  for (const note of index.notes()) {
    if (note.path === target.path) {
      continue;
    }
    const html = await readVaultText(vaultRoot, note.path);
    const hits = scanMentions(html, phrases);
    for (const hit of hits) {
      result.push({
        sourcePath: note.path,
        sourceId: note.id,
        sourceTitle: note.title,
        text: hit.text,
        phrase: hit.phrase,
        matchedBy: hit.matchedBy,
        context: mentionContext(note.plainText, hit.text, hit.occurrence),
        position: hit.rawStart,
      });
    }
  }
  return sortMentions(result);
}

export function rewriteUnlinkedMentions(options: {
  readonly html: string;
  readonly fromPath: string;
  readonly target: MentionTarget;
}): { readonly html: string; readonly linked: number } {
  const fromPath = vaultRelative(options.fromPath);
  const phrases = buildPhrases(options.target);
  const hits = scanMentions(options.html, phrases);
  if (hits.length === 0) {
    return { html: options.html, linked: 0 };
  }
  const href = relativeNoteHref(fromPath, options.target.path);
  if (href === null || !isProducedHref(href)) {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  const edits: Edit[] = hits.map((hit) => ({
    start: hit.rawStart,
    end: hit.rawEnd,
    text: `<a href="${escapeAttr(href)}" data-g-to="${escapeAttr(options.target.id)}">${escapeText(hit.text)}</a>`,
  }));
  const edited = applyEdits(options.html, edits);
  return { html: edited, linked: hits.length };
}

export async function linkUnlinkedMentions(options: unknown): Promise<{
  readonly notes: readonly {
    readonly path: string;
    readonly hash: string;
    readonly linked: number;
  }[];
}> {
  const input = readLinkMentions(options);
  const index = await openVaultIndex(input.vaultRoot);
  try {
    if (index.notes().length === 0) {
      await index.rebuild();
    }
    const target = resolveTarget(index, input.ref);
    const config = await readVaultConfig(input.vaultRoot);
    const rel = { strict: config.rel.strict, vocabulary: [...config.rel.vocabulary] };
    const planned: { path: string; original: string; html: string; linked: number }[] = [];
    for (const note of index.notes()) {
      if (note.path === target.path) {
        continue;
      }
      if (input.from !== undefined && note.path !== input.from) {
        continue;
      }
      if (input.onlyPaths !== undefined && !input.onlyPaths.includes(note.path)) {
        continue;
      }
      const original = await readVaultText(input.vaultRoot, note.path);
      const expected = input.ifMatches[note.path];
      if (expected !== undefined && noteContentHash(original) !== expected) {
        throw new GavetaError('E_CONFLICT');
      }
      const rewritten = rewriteUnlinkedMentions({
        html: original,
        fromPath: note.path,
        target,
      });
      if (rewritten.linked === 0 || rewritten.html === original) {
        continue;
      }
      const resolved = resolveNoteLinks({
        html: rewritten.html,
        fromPath: note.path,
        index,
        rel,
        allowPending: true,
      });
      if (!resolved.ok) {
        throw new GavetaError('E_HTML_INVALID');
      }
      const validated = validateNote(resolved.html, {
        notePath: note.path,
        strictRel: config.rel.strict,
        relVocabulary: config.rel.vocabulary,
        remoteAllowlist: config.remoteAllowlist,
      });
      if (!validated.ok || validated.note === null) {
        throw new GavetaError('E_HTML_INVALID');
      }
      planned.push({
        path: note.path,
        original,
        html: resolved.html,
        linked: rewritten.linked,
      });
    }
    const written: { path: string; hash: string; linked: number }[] = [];
    for (const file of planned) {
      await writeVaultText(input.vaultRoot, file.path, file.html);
      await index.upsert(file.path);
      written.push({
        path: file.path,
        hash: noteContentHash(file.html),
        linked: file.linked,
      });
    }
    return { notes: written };
  } finally {
    index.close();
  }
}

function resolveTarget(index: VaultIndex, ref: string): MentionTarget {
  const resolved = resolveRef(index, ref);
  if (resolved.id === null) {
    throw new GavetaError('E_META_MISSING');
  }
  const note = index.note(resolved.path);
  if (note === null) {
    throw new GavetaError('E_REF_NOT_FOUND');
  }
  return {
    id: resolved.id,
    path: resolved.path,
    title: note.title,
    aliases: [...note.aliases],
  };
}

function buildPhrases(target: MentionTarget): MentionPhrase[] {
  const phrases: MentionPhrase[] = [];
  const seen = new Set<string>();
  const add = (phrase: string, matchedBy: 'title' | 'alias'): void => {
    const trimmed = phrase.trim();
    if (trimmed.length === 0) {
      return;
    }
    const folded = foldMatchKey(trimmed);
    if (seen.has(folded)) {
      return;
    }
    seen.add(folded);
    phrases.push({ phrase: trimmed, folded, matchedBy });
  };
  add(target.title, 'title');
  for (const alias of target.aliases) {
    add(alias, 'alias');
  }
  phrases.sort((left, right) => right.phrase.length - left.phrase.length);
  return phrases;
}

interface RawHit {
  readonly text: string;
  readonly phrase: string;
  readonly matchedBy: 'title' | 'alias';
  readonly occurrence: number;
  readonly rawStart: number;
  readonly rawEnd: number;
}

function scanMentions(html: string, phrases: readonly MentionPhrase[]): RawHit[] {
  const bomPrefix = html.startsWith('\uFEFF') ? 1 : 0;
  const source = html.slice(bomPrefix);
  let document: ParseDocument;
  try {
    document = parse(source, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  } catch {
    return [];
  }
  const body = findBody(document);
  if (body === null) {
    return [];
  }
  const hits: RawHit[] = [];
  const occurrenceByText = new Map<string, number>();
  walkText(body, source, bomPrefix, (baseOffset, decodedView) => {
    const taken = excludedTextRanges(decodedView.decoded);
    for (const phrase of phrases) {
      collectPhraseMatches(phrase, decodedView, taken, hits, occurrenceByText, baseOffset);
    }
  });
  return hits.sort(
    (left, right) => left.rawStart - right.rawStart || left.text.localeCompare(right.text),
  );
}

function sortMentions(rows: UnlinkedMention[]): UnlinkedMention[] {
  return [...rows].sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) || left.position - right.position,
  );
}

function collectPhraseMatches(
  phrase: MentionPhrase,
  decodedView: DecodedSlice,
  taken: boolean[],
  hits: RawHit[],
  occurrenceByText: Map<string, number>,
  baseOffset: number,
): void {
  const haystack = decodedView.decoded;
  const len = phrase.phrase.length;
  if (len === 0) {
    return;
  }
  let cursor = 0;
  while (cursor <= haystack.length - len) {
    const slice = haystack.slice(cursor, cursor + len);
    if (foldMatchKey(slice) !== phrase.folded) {
      cursor += 1;
      continue;
    }
    if (!hasBoundary(haystack, cursor, len)) {
      cursor += 1;
      continue;
    }
    if (taken.slice(cursor, cursor + len).some(Boolean)) {
      cursor += 1;
      continue;
    }
    const rawStart = baseOffset + (decodedView.rawStart[cursor] ?? 0);
    const rawEnd =
      baseOffset +
      (cursor + len < decodedView.rawStart.length
        ? (decodedView.rawStart[cursor + len] ?? decodedView.rawEnd)
        : decodedView.rawEnd);
    for (let index = cursor; index < cursor + len; index += 1) {
      taken[index] = true;
    }
    const occurrence = occurrenceByText.get(slice) ?? 0;
    occurrenceByText.set(slice, occurrence + 1);
    hits.push({
      text: slice,
      phrase: phrase.phrase,
      matchedBy: phrase.matchedBy,
      occurrence,
      rawStart,
      rawEnd,
    });
    cursor += len;
  }
}

function excludedTextRanges(decoded: string): boolean[] {
  const excluded = new Array<boolean>(decoded.length).fill(false);
  let cursor = 0;
  while (cursor < decoded.length) {
    if (decoded.startsWith('[[', cursor)) {
      const from = cursor > 0 && decoded[cursor - 1] === '!' ? cursor - 1 : cursor;
      const close = decoded.indexOf(']]', cursor + 2);
      if (close === -1) {
        break;
      }
      for (let index = from; index < close + 2; index += 1) {
        excluded[index] = true;
      }
      cursor = close + 2;
      continue;
    }
    cursor += 1;
  }
  return excluded;
}

function hasBoundary(haystack: string, start: number, length: number): boolean {
  const before = start === 0 ? '' : (haystack[start - 1] ?? '');
  const after = start + length >= haystack.length ? '' : (haystack[start + length] ?? '');
  return !isWordChar(before) && !isWordChar(after);
}

function isWordChar(character: string): boolean {
  if (character.length === 0) {
    return false;
  }
  return /[\p{L}\p{N}]/u.test(character);
}

function walkText(
  body: ParseElement,
  source: string,
  bomPrefix: number,
  onText: (baseOffset: number, decoded: DecodedSlice) => void,
): void {
  const stack: {
    nodes: readonly ParseChild[];
    index: number;
    depth: number;
    inCode: boolean;
    inAnchor: boolean;
  }[] = [{ nodes: body.childNodes, index: 0, depth: 0, inCode: false, inAnchor: false }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) {
      return;
    }
    const node = frame.nodes[frame.index];
    if (node === undefined) {
      stack.pop();
      continue;
    }
    frame.index += 1;
    if (isTextNode(node)) {
      if (!frame.inCode && !frame.inAnchor) {
        const location = node.sourceCodeLocation;
        if (location !== undefined && location !== null) {
          const raw = source.slice(location.startOffset, location.endOffset);
          onText(bomPrefix + location.startOffset, decodeWithMap(raw, location.endOffset));
        }
      }
      continue;
    }
    if (!isElementNode(node)) {
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'template') {
      continue;
    }
    const inAnchor = frame.inAnchor || tag === 'a';
    if (frame.depth >= MAX_NOTE_DEPTH) {
      continue;
    }
    stack.push({
      nodes: node.childNodes,
      index: 0,
      depth: frame.depth + 1,
      inCode: frame.inCode || tag === 'pre' || tag === 'code',
      inAnchor,
    });
  }
}

function decodeWithMap(raw: string, rawEnd: number): DecodedSlice {
  const rawStart: number[] = [];
  let decoded = '';
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character !== '&') {
      rawStart.push(index);
      decoded += character ?? '';
      continue;
    }
    const semi = raw.indexOf(';', index + 1);
    if (semi === -1 || semi - index > 12) {
      rawStart.push(index);
      decoded += '&';
      continue;
    }
    const entity = raw.slice(index + 1, semi);
    const replacement = decodeEntity(entity);
    if (replacement === null) {
      rawStart.push(index);
      decoded += '&';
      continue;
    }
    for (const decodedChar of replacement) {
      rawStart.push(index);
      decoded += decodedChar;
    }
    index = semi;
  }
  return { decoded, rawStart, rawEnd };
}

function decodeEntity(entity: string): string | null {
  switch (entity) {
    case 'amp':
      return '&';
    case 'lt':
      return '<';
    case 'gt':
      return '>';
    case 'quot':
      return '"';
    case 'apos':
      return "'";
    case 'nbsp':
      return ' ';
    default:
      break;
  }
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    return decodeCodePoint(Number.parseInt(entity.slice(2), 16));
  }
  if (entity.startsWith('#')) {
    return decodeCodePoint(Number.parseInt(entity.slice(1), 10));
  }
  return null;
}

function decodeCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
    return null;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

function mentionContext(plainText: string, needle: string, occurrence: number): string {
  if (needle.length === 0) {
    return plainText.trim().slice(0, BACKLINK_CONTEXT_LIMIT);
  }
  const start = findOccurrence(plainText, needle, occurrence);
  if (start === null) {
    return needle.slice(0, BACKLINK_CONTEXT_LIMIT);
  }
  if (needle.length >= BACKLINK_CONTEXT_LIMIT) {
    return plainText.slice(start, start + BACKLINK_CONTEXT_LIMIT);
  }
  let from = start;
  let to = start + needle.length;
  let budget = BACKLINK_CONTEXT_LIMIT - (to - from);
  while (budget > 0 && (from > 0 || to < plainText.length)) {
    if (from > 0) {
      from -= 1;
      budget -= 1;
    }
    if (budget > 0 && to < plainText.length) {
      to += 1;
      budget -= 1;
    }
  }
  return plainText.slice(from, to).trim();
}

function findOccurrence(haystack: string, needle: string, occurrence: number): number | null {
  if (needle.length === 0 || occurrence < 0) {
    return null;
  }
  let from = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    const found = haystack.indexOf(needle, from);
    if (found === -1) {
      return null;
    }
    if (index === occurrence) {
      return found;
    }
    from = found + 1;
  }
  return null;
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

function findBody(document: ParseDocument): ParseElement | null {
  for (const child of document.childNodes) {
    if (!isElementNode(child) || child.tagName !== 'html') {
      continue;
    }
    for (const inner of child.childNodes) {
      if (isElementNode(inner) && inner.tagName === 'body') {
        return inner;
      }
    }
  }
  return null;
}

function readLinkMentions(options: unknown): {
  readonly vaultRoot: string;
  readonly ref: string;
  readonly from: string | undefined;
  readonly ifMatches: Readonly<Record<string, string>>;
  readonly onlyPaths: readonly string[] | undefined;
} {
  const record = readRecord(options, LINK_KEYS);
  const vaultRoot = record.vaultRoot;
  const ref = record.ref;
  if (typeof vaultRoot !== 'string' || typeof ref !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const from = record.from;
  if (from !== undefined && typeof from !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const ifMatches = readIfMatches(record.ifMatches);
  const onlyPaths = readOnlyPaths(record.onlyPaths);
  return { vaultRoot, ref: ref.trim(), from: from?.trim(), ifMatches, onlyPaths };
}

function readOnlyPaths(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const paths: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new GavetaError('E_ARG_INVALID');
    }
    paths.push(entry.trim());
  }
  return paths;
}

function readIfMatches(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const out: Record<string, string> = {};
  for (const [path, hash] of Object.entries(value)) {
    if (typeof hash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(hash)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    out[path] = hash;
  }
  return out;
}

function readRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    record[key] = value[key as keyof typeof value];
  }
  return record;
}

function vaultRelative(value: string): string {
  const inspected = inspectVaultPath(value);
  if (!inspected.ok) {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  return inspected.path;
}

function isTextNode(node: ParseChild): node is ParseText {
  return node.nodeName === '#text';
}

function isElementNode(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}
