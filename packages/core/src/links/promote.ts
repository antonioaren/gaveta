import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { isUlid } from '../contract.ts';
import { GavetaError } from '../errors.ts';
import { MAX_NOTE_DEPTH } from '../parser.ts';
import { foldMatchKey } from '../sqlite/schema.ts';
import { VaultIndex } from '../sqlite/store.ts';
import { hasNodeErrorCode } from '../vault/node-error.ts';
import { vaultNotFound } from '../vault/errors.ts';
import { readVaultText, resolveInsideVault, writeVaultText } from '../vault/paths.ts';
import {
  comparePath,
  escapeAttr,
  inspectVaultPath,
  isProducedHref,
  relativeNoteHref,
} from './path.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseText = DefaultTreeAdapterMap['textNode'];

/** The note that was just created. Aliases are matched as well as the title. */
export interface PromotePendingNote {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly aliases?: readonly string[];
}

/** One pending anchor that was rewritten to a canonical link. */
export interface PromotedAnchor {
  readonly pendingTitle: string;
  readonly href: string;
  readonly text: string;
  readonly matchedBy: 'title' | 'alias';
}

/** A vault note whose pending anchors were promoted. */
export interface PromotedNote {
  readonly path: string;
  readonly anchors: readonly PromotedAnchor[];
}

export interface PromoteAnchorsResult {
  readonly html: string;
  readonly anchors: readonly PromotedAnchor[];
}

export interface PromotePendingResult {
  readonly notes: readonly PromotedNote[];
}

interface PreparedTarget {
  readonly id: string;
  readonly path: string;
  readonly keys: ReadonlyMap<string, 'title' | 'alias'>;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface PlannedNote {
  readonly path: string;
  readonly original: string;
  readonly html: string;
  readonly anchors: readonly PromotedAnchor[];
}

/**
 * Rewrite `data-g-pending` anchors that match the created note's title or aliases.
 * Comparison uses `foldMatchKey` (case and accents), not slugs. The rest of `html`
 * stays byte for byte, including wikilinks and anchors that already have `data-g-to`.
 */
export function promotePendingAnchors(options: {
  readonly html: string;
  readonly fromPath: string;
  readonly note: PromotePendingNote;
}): PromoteAnchorsResult {
  const record = readRecord(options, ['html', 'fromPath', 'note']);
  const html = record.html;
  const fromPath = record.fromPath;
  if (typeof html !== 'string' || typeof fromPath !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  return rewritePending(html, vaultRelative(fromPath), preparedTarget(record.note));
}

/**
 * Promote pending anchors already stored in the index so they point at `note`.
 * Every rewrite is planned before the first write. Files are replaced with
 * `writeVaultText` and then reindexed. If a later write fails, earlier files
 * in the batch are restored. Index the new note first when it still contains
 * a matching pending of its own.
 */
export async function promotePendingLinks(options: {
  readonly vaultRoot: string;
  readonly index: VaultIndex;
  readonly note: PromotePendingNote;
}): Promise<PromotePendingResult> {
  const record = readRecord(options, ['vaultRoot', 'index', 'note']);
  const vaultRoot = record.vaultRoot;
  const index = record.index;
  if (typeof vaultRoot !== 'string' || !(index instanceof VaultIndex)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const target = preparedTarget(record.note);
  await assertIndexVault(vaultRoot, index);
  await resolveInsideVault(vaultRoot, target.path);
  const planned: PlannedNote[] = [];
  for (const notePath of candidatePaths(index, target.keys)) {
    const original = await readVaultText(vaultRoot, notePath);
    const rewritten = rewritePending(original, notePath, target);
    if (rewritten.anchors.length === 0 || rewritten.html === original) {
      continue;
    }
    planned.push({
      path: notePath,
      original,
      html: rewritten.html,
      anchors: rewritten.anchors,
    });
  }
  await commitPlanned(vaultRoot, index, planned);
  return {
    notes: planned.map((file) => ({ path: file.path, anchors: file.anchors })),
  };
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

function preparedTarget(value: unknown): PreparedTarget {
  const note = readRecord(value, ['id', 'path', 'title', 'aliases']);
  const id = note.id;
  const title = note.title;
  const notePath = note.path;
  if (typeof id !== 'string' || !isUlid(id)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (typeof notePath !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const relative = vaultRelative(notePath);
  if (!relative.endsWith('.html')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const keys = new Map<string, 'title' | 'alias'>();
  keys.set(foldMatchKey(title.trim()), 'title');
  const aliases = note.aliases;
  if (aliases !== undefined) {
    if (!Array.isArray(aliases)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    for (const alias of aliases) {
      if (typeof alias !== 'string') {
        throw new GavetaError('E_ARG_INVALID');
      }
      const trimmed = alias.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const folded = foldMatchKey(trimmed);
      if (!keys.has(folded)) {
        keys.set(folded, 'alias');
      }
    }
  }
  return { id, path: relative, keys };
}

function vaultRelative(value: string): string {
  const inspected = inspectVaultPath(value);
  if (!inspected.ok) {
    throw pathFailure(inspected.reason);
  }
  return inspected.path;
}

function pathFailure(reason: 'outside' | 'unsafe-url' | 'empty'): GavetaError {
  if (reason === 'unsafe-url') {
    return new GavetaError('E_UNSAFE_URL');
  }
  if (reason === 'empty') {
    return new GavetaError('E_ARG_INVALID');
  }
  return new GavetaError('E_PATH_OUTSIDE_VAULT');
}

function rewritePending(
  html: string,
  fromPath: string,
  target: PreparedTarget,
): PromoteAnchorsResult {
  const bom = html.startsWith('\uFEFF');
  const source = bom ? html.slice(1) : html;
  let document: ParseDocument;
  try {
    document = parse(source, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  } catch {
    throw new GavetaError('E_HTML_INVALID');
  }
  const edits: Edit[] = [];
  const anchors: PromotedAnchor[] = [];
  const body = findBody(document);
  if (body !== null) {
    collectAnchors(body, source, fromPath, target, edits, anchors);
  }
  const edited = applyEdits(source, edits);
  return { html: bom ? `\uFEFF${edited}` : edited, anchors };
}

function collectAnchors(
  body: ParseElement,
  source: string,
  fromPath: string,
  target: PreparedTarget,
  edits: Edit[],
  anchors: PromotedAnchor[],
): void {
  const stack: { nodes: readonly ParseChild[]; index: number; depth: number }[] = [
    { nodes: body.childNodes, index: 0, depth: 0 },
  ];
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
    if (!isElementNode(node)) {
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'a') {
      promoteAnchor(node, source, fromPath, target, edits, anchors);
    }
    if (
      tag === 'script' ||
      tag === 'style' ||
      tag === 'template' ||
      frame.depth >= MAX_NOTE_DEPTH
    ) {
      continue;
    }
    stack.push({ nodes: node.childNodes, index: 0, depth: frame.depth + 1 });
  }
}

function promoteAnchor(
  element: ParseElement,
  source: string,
  fromPath: string,
  target: PreparedTarget,
  edits: Edit[],
  anchors: PromotedAnchor[],
): void {
  if (trimmedAttr(element, 'data-g-to') !== null) {
    return;
  }
  const pending = trimmedAttr(element, 'data-g-pending');
  if (pending === null) {
    return;
  }
  const matchedBy = target.keys.get(foldMatchKey(pending));
  if (matchedBy === undefined) {
    return;
  }
  const href = relativeNoteHref(fromPath, target.path);
  if (href === null || !isProducedHref(href)) {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  const removed = removeAttribute(source, element, 'href');
  if (removed !== null) {
    edits.push(removed);
  }
  edits.push(
    replaceAttribute(
      source,
      element,
      'data-g-pending',
      `href="${escapeAttr(href)}" data-g-to="${escapeAttr(target.id)}"`,
    ),
  );
  anchors.push({ pendingTitle: pending, href, text: elementText(element), matchedBy });
}

function replaceAttribute(source: string, element: ParseElement, name: string, text: string): Edit {
  const span = element.sourceCodeLocation?.attrs?.[name];
  if (span === undefined || span.startOffset < 0 || span.endOffset > source.length) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return { start: span.startOffset, end: span.endOffset, text };
}

function removeAttribute(source: string, element: ParseElement, name: string): Edit | null {
  const span = element.sourceCodeLocation?.attrs?.[name];
  if (span === undefined || span.startOffset < 0 || span.endOffset > source.length) {
    return null;
  }
  let start = span.startOffset;
  while (start > 0 && isSpace(source[start - 1])) {
    start -= 1;
  }
  return { start, end: span.endOffset, text: '' };
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

function candidatePaths(index: VaultIndex, keys: ReadonlyMap<string, 'title' | 'alias'>): string[] {
  const found = new Set<string>();
  for (const link of index.links()) {
    if (link.kind !== 'pending' || link.pendingTitle === null) {
      continue;
    }
    if (!keys.has(foldMatchKey(link.pendingTitle.trim()))) {
      continue;
    }
    found.add(link.path);
  }
  return [...found].sort(comparePath);
}

async function commitPlanned(
  vaultRoot: string,
  index: VaultIndex,
  planned: readonly PlannedNote[],
): Promise<void> {
  const written: PlannedNote[] = [];
  try {
    for (const file of planned) {
      await writeVaultText(vaultRoot, file.path, file.html);
      written.push(file);
    }
    for (const file of written) {
      await index.upsert(file.path);
    }
  } catch (error) {
    await restorePlanned(vaultRoot, index, written);
    throw error;
  }
}

async function restorePlanned(
  vaultRoot: string,
  index: VaultIndex,
  written: readonly PlannedNote[],
): Promise<void> {
  const reversed = [...written].reverse();
  for (const file of reversed) {
    await writeVaultText(vaultRoot, file.path, file.original);
  }
  for (const file of written) {
    await index.upsert(file.path);
  }
}

async function assertIndexVault(vaultRoot: string, index: VaultIndex): Promise<void> {
  let root: string;
  let indexFile: string;
  try {
    root = await realpath(vaultRoot);
    indexFile = await realpath(index.location);
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ENOTDIR') ||
      hasNodeErrorCode(error, 'ELOOP')
    ) {
      throw vaultNotFound();
    }
    throw error;
  }
  if (path.dirname(path.dirname(indexFile)) !== root) {
    throw new GavetaError('E_ARG_INVALID');
  }
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

function trimmedAttr(element: ParseElement, name: string): string | null {
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

function elementText(element: ParseElement): string {
  let text = '';
  const frames: { nodes: readonly ParseChild[]; index: number }[] = [
    { nodes: element.childNodes, index: 0 },
  ];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    if (frame === undefined) {
      break;
    }
    const node = frame.nodes[frame.index];
    if (node === undefined) {
      frames.pop();
      continue;
    }
    frame.index += 1;
    if (isTextNode(node)) {
      text += node.value;
      continue;
    }
    if (isElementNode(node)) {
      frames.push({ nodes: node.childNodes, index: 0 });
    }
  }
  return collapse(text);
}

function collapse(value: string): string {
  let out = '';
  let pending = false;
  for (const character of value) {
    if (character === ' ' || character === '\n' || character === '\t' || character === '\r') {
      pending = out.length > 0;
      continue;
    }
    if (pending) {
      out += ' ';
      pending = false;
    }
    out += character;
  }
  return out;
}

function isSpace(character: string | undefined): boolean {
  return character === ' ' || character === '\n' || character === '\t' || character === '\r';
}

function isTextNode(node: ParseChild): node is ParseText {
  return node.nodeName === '#text';
}

function isElementNode(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}
