/**
 * Create, read, and partially edit notes.
 * `new` normalizes, resolves `[[…]]`, validates, then writes.
 * `edit` splices one section (or the article) so the rest of the file stays
 * byte for byte, then runs the same resolver. Every write honors `--if-match`
 * before it touches the vault.
 */
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { ARTIFACT_CDN_META } from './artifact.ts';
import { allocateSlug, isIso8601, isNoteType, isUlid, slugify, type NoteType } from './contract.ts';
import {
  GavetaError,
  isErrorCode,
  isWarningCode,
  type DiagnosticCode,
  type ErrorCode,
  type WarningCode,
} from './errors.ts';
import { escapeAttr, escapeText, inspectVaultPath, relativeNoteHref } from './links/path.ts';
import { GavetaRefError, notesForId, resolveRef } from './links/ref.ts';
import { resolveNoteLinks } from './links/rewrite.ts';
import {
  promotePendingLinks,
  type PromotePendingNote,
  type PromotedNote,
} from './links/promote.ts';
import type { LinkDiagnostic, NoteSuggestion, RelPolicy, ResolvedLink } from './links/types.ts';
import { normalizeNote } from './normalize.ts';
import {
  parseNote,
  type NoteLink,
  type NoteModel,
  type NoteSection,
  type NoteTask,
} from './parser.ts';
import type { VaultIndex } from './sqlite/store.ts';
import { openVaultIndex } from './sqlite/store.ts';
import { validateNote } from './validate.ts';
import type { VaultConfig } from './vault/config.ts';
import { readVaultConfig } from './vault/config.ts';
import { hasNodeErrorCode } from './vault/node-error.ts';
import { readVaultText, resolveInsideVault, writeVaultText } from './vault/paths.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];

const HASH_PREFIX = 'sha256:';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CARRIER_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const CARRIER_CREATED = '2026-10-22T00:00:00.000Z';

const CREATE_KEYS = [
  'vaultRoot',
  'title',
  'type',
  'folder',
  'tags',
  'aliases',
  'html',
  'ifMatch',
  'now',
  'id',
  'artifactCdn',
] as const;

const READ_KEYS = ['vaultRoot', 'ref', 'as'] as const;
const EDIT_KEYS = ['vaultRoot', 'ref', 'html', 'section', 'mode', 'ifMatch'] as const;
const LINK_KEYS = ['vaultRoot', 'from', 'to', 'rel', 'text', 'section', 'ifMatch'] as const;

const RELATED_SECTION_ID = 'relacionado';
const RELATED_SECTION_TITLE = 'Relacionado';

export interface NoteWarning {
  readonly code: WarningCode;
  readonly params: Readonly<Record<string, string | number>>;
}

export interface SavedLink {
  readonly kind: 'canonical' | 'pending';
  readonly text: string;
  readonly title: string;
  readonly id: string | null;
  readonly path: string | null;
  readonly href: string | null;
  readonly suggestions: readonly NoteSuggestion[];
}

export interface NoteWriteFailure {
  readonly ok: false;
  readonly warnings: readonly NoteWarning[];
}

export interface OutlineSection {
  readonly id: string | null;
  readonly heading: string | null;
  readonly level: number | null;
  readonly text: string;
  readonly children: readonly OutlineSection[];
}

export interface OutlineTask {
  readonly id: string | null;
  readonly text: string;
  readonly checked: boolean;
  readonly due: string | null;
  readonly priority: string | null;
  readonly sectionId: string | null;
}

export interface OutlineLink {
  readonly kind: NoteLink['kind'];
  readonly text: string;
  readonly href: string | null;
  readonly targetId: string | null;
  readonly pendingTitle: string | null;
  readonly sectionId: string | null;
}

export interface NoteOutline {
  readonly sections: readonly OutlineSection[];
  readonly tasks: readonly OutlineTask[];
  readonly links: readonly OutlineLink[];
}

interface SavedNote {
  readonly id: string;
  readonly path: string;
  readonly hash: string;
  readonly title: string;
  readonly type: NoteType;
  readonly links: {
    readonly resolved: readonly SavedLink[];
    readonly pending: readonly SavedLink[];
  };
  readonly warnings: readonly NoteWarning[];
}

export interface CreateNoteSuccess extends SavedNote {
  readonly ok: true;
  readonly promoted: readonly PromotedNote[];
}

export type CreateNoteResult = CreateNoteSuccess | NoteWriteFailure;

export interface EditNoteSuccess extends SavedNote {
  readonly ok: true;
  readonly section: string | null;
}

export type EditNoteResult = EditNoteSuccess | NoteWriteFailure;

export interface LinkNoteSuccess extends SavedNote {
  readonly ok: true;
  readonly section: string;
  readonly added: boolean;
}

export type LinkNoteResult = LinkNoteSuccess | NoteWriteFailure;

export type ReadNoteResult = {
  readonly id: string | null;
  readonly path: string;
  readonly title: string;
  readonly type: NoteType | null;
  readonly hash: string;
} & (
  | { readonly as: 'html'; readonly html: string }
  | { readonly as: 'text'; readonly text: string }
  | { readonly as: 'outline'; readonly outline: NoteOutline }
);

interface Session {
  readonly root: string;
  readonly config: VaultConfig;
  readonly index: VaultIndex;
  readonly warnings: NoteWarning[];
}

interface DiagnosticLike {
  readonly code: DiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly details: Readonly<Record<string, unknown>> | null;
}

interface TagSpan {
  readonly startOffset: number;
  readonly endOffset: number;
}

interface CreateInput {
  readonly vaultRoot: string;
  readonly title: string;
  readonly type: NoteType;
  readonly folder: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly html: string | null;
  readonly ifMatch: string | undefined;
  readonly now: string;
  readonly id: string;
  readonly artifactCdn: boolean;
}

type ReadAs = 'html' | 'text' | 'outline';
type EditMode = 'replace' | 'append' | 'prepend';

/** `sha256:` plus the hex digest of the note file, UTF-8. */
export function noteContentHash(text: string): string {
  return `${HASH_PREFIX}${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export async function createNote(options: unknown): Promise<CreateNoteResult> {
  const input = readCreate(options);
  return withSession(input.vaultRoot, async (session) => {
    if (input.ifMatch !== undefined) {
      throw new GavetaError('E_CONFLICT');
    }
    if (notesForId(session.index, input.id).length > 0) {
      throw new GavetaError('E_ID_DUPLICATE');
    }
    const notePath = await allocateNotePath(session.root, input.folder, input.title);
    const composed = composeDocument(input);
    const normalized = normalizeNote(composed, {
      notePath,
      remoteAllowlist: session.config.remoteAllowlist,
    });
    if (normalized.html === null) {
      const failed = gate(asLikes(normalized.diagnostics));
      if (!failed.ok) {
        return failure(session, failed);
      }
      throw new GavetaError('E_HTML_INVALID');
    }
    const normalizeGate = gate(asLikes(normalized.diagnostics));
    if (!normalizeGate.ok) {
      return failure(session, normalizeGate);
    }
    const resolved = resolveFor(session, normalized.html, notePath);
    const resolveGate = gate(resolved.errors);
    if (!resolveGate.ok) {
      return failure(session, resolveGate);
    }
    const validated = validateNote(resolved.html, validateOptions(session, notePath));
    const validateGate = gate(asLikes(validated.diagnostics));
    if (!validateGate.ok) {
      return failure(session, validateGate);
    }
    const createdId = validated.note?.id ?? null;
    if (validated.note === null || createdId === null) {
      throw new GavetaError('E_META_MISSING');
    }
    await ensureDirectory(session.root, input.folder);
    await assertDestinationFree(session.root, notePath);
    await writeVaultText(session.root, notePath, resolved.html);
    await session.index.upsert(notePath);
    const promoteNote = promoteTarget(createdId, notePath, input.title, input.aliases);
    const promoted = await promotePendingLinks({
      vaultRoot: session.root,
      index: session.index,
      note: promoteNote,
    });
    const finalHtml = promoted.notes.some((item) => item.path === notePath)
      ? await readVaultText(session.root, notePath)
      : resolved.html;
    return {
      ok: true,
      id: createdId,
      path: notePath,
      hash: noteContentHash(finalHtml),
      title: input.title,
      type: input.type,
      links: savedLinks(resolved.links, resolved.warnings, session.index),
      promoted: promoted.notes,
      warnings: [
        ...session.warnings,
        ...warningList(normalized.diagnostics),
        ...warningList(resolved.warnings),
      ],
    };
  });
}

export async function readNote(options: unknown): Promise<ReadNoteResult> {
  const input = readRead(options);
  return withSession(input.vaultRoot, async (session) => {
    const resolved = resolveRef(session.index, input.ref);
    const html = await readVaultText(session.root, resolved.path);
    const parsed = parseNote(html);
    if (!parsed.ok || parsed.note === null) {
      throw new GavetaError('E_HTML_INVALID');
    }
    const base = {
      id: parsed.note.id,
      path: resolved.path,
      title: parsed.note.title ?? parsed.note.metadata.title ?? resolved.title,
      type: parsed.note.type,
      hash: noteContentHash(html),
    };
    if (input.as === 'html') {
      return { ...base, as: 'html', html };
    }
    if (input.as === 'text') {
      return { ...base, as: 'text', text: parsed.note.plainText };
    }
    return { ...base, as: 'outline', outline: toOutline(parsed.note) };
  });
}

export async function linkNote(options: unknown): Promise<LinkNoteResult> {
  const input = readLink(options);
  return withSession(input.vaultRoot, async (session) => {
    const source = resolveRef(session.index, input.from);
    const target = resolveRef(session.index, input.to);
    if (target.id === null) {
      throw new GavetaError('E_META_MISSING');
    }
    const original = await readVaultText(session.root, source.path);
    assertMatch(noteContentHash(original), input.ifMatch);
    const parsed = parseNote(original);
    if (!parsed.ok || parsed.note === null) {
      throw new GavetaError('E_HTML_INVALID');
    }
    const sectionId = input.section ?? RELATED_SECTION_ID;
    const linkText = input.text ?? target.title;
    if (hasMatchingLink(parsed.note, target.id, sectionId, linkText, input.rel)) {
      return presentLinkNote(session, source, parsed.note, original, sectionId, false);
    }
    const anchor = buildCanonicalAnchor(source.path, target.path, target.id, linkText, input.rel);
    const spliced = insertCanonicalLink(original, sectionId, input.section !== undefined, anchor);
    const resolved = resolveFor(session, spliced, source.path);
    const resolveGate = gate(resolved.errors);
    if (!resolveGate.ok) {
      return failure(session, resolveGate);
    }
    const validated = validateNote(resolved.html, validateOptions(session, source.path));
    const validateGate = gate(asLikes(validated.diagnostics));
    if (!validateGate.ok) {
      return failure(session, validateGate);
    }
    const saved = validated.note;
    if (saved === null) {
      throw new GavetaError('E_META_MISSING');
    }
    if (saved.id === null || saved.type === null) {
      throw new GavetaError('E_META_MISSING');
    }
    if (resolved.html !== original) {
      await writeVaultText(session.root, source.path, resolved.html);
      await session.index.upsert(source.path);
    }
    return {
      ok: true,
      id: saved.id,
      path: source.path,
      hash: noteContentHash(resolved.html),
      title: saved.title ?? source.title,
      type: saved.type,
      section: sectionId,
      added: true,
      links: savedLinks(resolved.links, resolved.warnings, session.index),
      warnings: [...session.warnings, ...warningList(resolved.warnings)],
    };
  });
}

export async function editNote(options: unknown): Promise<EditNoteResult> {
  const input = readEdit(options);
  return withSession(input.vaultRoot, async (session) => {
    const target = resolveRef(session.index, input.ref);
    const original = await readVaultText(session.root, target.path);
    assertMatch(noteContentHash(original), input.ifMatch);
    const piece = sanitizeFragment(input.html, target.path, session.config.remoteAllowlist);
    if (!piece.ok) {
      return failure(session, piece);
    }
    const spliced = spliceNote(original, input.mode, input.section, piece.inner, piece.article);
    const resolved = resolveFor(session, spliced, target.path);
    const resolveGate = gate(resolved.errors);
    if (!resolveGate.ok) {
      return failure(session, resolveGate);
    }
    const validated = validateNote(resolved.html, validateOptions(session, target.path));
    const validateGate = gate(asLikes(validated.diagnostics));
    if (!validateGate.ok) {
      return failure(session, validateGate);
    }
    if (validated.note === null) {
      throw new GavetaError('E_META_MISSING');
    }
    if (validated.note.id === null || validated.note.type === null) {
      throw new GavetaError('E_META_MISSING');
    }
    if (resolved.html !== original) {
      await writeVaultText(session.root, target.path, resolved.html);
      await session.index.upsert(target.path);
    }
    return {
      ok: true,
      id: validated.note.id,
      path: target.path,
      hash: noteContentHash(resolved.html),
      title: validated.note.title ?? target.title,
      type: validated.note.type,
      section: input.section,
      links: savedLinks(resolved.links, resolved.warnings, session.index),
      warnings: [...session.warnings, ...piece.warnings, ...warningList(resolved.warnings)],
    };
  });
}

function promoteTarget(
  id: string,
  notePath: string,
  title: string,
  aliases: readonly string[],
): PromotePendingNote {
  if (aliases.length === 0) {
    return { id, path: notePath, title };
  }
  return { id, path: notePath, title, aliases };
}

function failure(session: Session, gateResult: Gate): NoteWriteFailure {
  const extra = gateResult.ok ? [] : gateResult.warnings;
  return { ok: false, warnings: [...session.warnings, ...extra] };
}

async function withSession<T>(
  vaultRoot: string,
  run: (session: Session) => Promise<T>,
): Promise<T> {
  const config = await readVaultConfig(vaultRoot);
  const index = await openVaultIndex(vaultRoot);
  try {
    const warnings: NoteWarning[] = [];
    const recovered = index.recovery();
    if (recovered !== null || index.notes().length === 0) {
      await index.rebuild();
    }
    if (recovered !== null) {
      warnings.push({ code: 'W_INDEX_RECOVERED', params: {} });
    }
    return await run({ root: vaultRoot, config, index, warnings });
  } finally {
    index.close();
  }
}

function resolveFor(
  session: Session,
  html: string,
  notePath: string,
): {
  readonly html: string;
  readonly links: readonly ResolvedLink[];
  readonly warnings: readonly LinkDiagnostic[];
  readonly errors: readonly LinkDiagnostic[];
} {
  return resolveNoteLinks({
    html,
    fromPath: notePath,
    index: session.index,
    rel: relPolicy(session.config),
    allowPending: true,
  });
}

function relPolicy(config: VaultConfig): RelPolicy {
  return { strict: config.rel.strict, vocabulary: config.rel.vocabulary };
}

function validateOptions(
  session: Session,
  notePath: string,
): {
  readonly strictRel: boolean;
  readonly relVocabulary: readonly string[];
  readonly remoteAllowlist: readonly string[];
  readonly notePath: string;
} {
  return {
    strictRel: session.config.rel.strict,
    relVocabulary: session.config.rel.vocabulary,
    remoteAllowlist: session.config.remoteAllowlist,
    notePath,
  };
}

function composeDocument(input: CreateInput): string {
  const body = composeBody(input.html, input.title, input.type);
  const head = [
    '<meta charset="utf-8">',
    `<title>${escapeText(input.title)}</title>`,
    `<meta name="gaveta:id" content="${escapeAttr(input.id)}">`,
    `<meta name="gaveta:type" content="${input.type}">`,
  ];
  if (input.tags.length > 0) {
    head.push(`<meta name="gaveta:tags" content="${escapeAttr(input.tags.join(', '))}">`);
  }
  if (input.aliases.length > 0) {
    head.push(`<meta name="gaveta:aliases" content="${escapeAttr(input.aliases.join(', '))}">`);
  }
  head.push(`<meta name="gaveta:created" content="${escapeAttr(input.now)}">`);
  head.push(`<meta name="gaveta:updated" content="${escapeAttr(input.now)}">`);
  if (input.type === 'artifact' && input.artifactCdn) {
    head.push(`<meta name="${ARTIFACT_CDN_META}" content="true">`);
  }
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body>${body}</body></html>`;
}

function composeBody(html: string | null, title: string, type: NoteType): string {
  if (html === null || html.trim().length === 0) {
    return defaultBody(title, type);
  }
  const inner = bodyInner(html);
  if (inner.trim().length === 0) {
    return defaultBody(title, type);
  }
  return inner;
}

function defaultBody(title: string, type: NoteType): string {
  const heading = escapeText(title);
  if (type === 'slides') {
    return `<section class="slide"><h2>${heading}</h2></section>`;
  }
  if (type === 'todo') {
    return `<h1>${heading}</h1>`;
  }
  if (type === 'dashboard') {
    return `<article class="g-dashboard"><h1>${heading}</h1></article>`;
  }
  if (type === 'design') {
    return `<section class="g-frame" data-device="desktop" id="pantalla"><h2>${heading}</h2></section>`;
  }
  if (type === 'artifact') {
    return `<article><h1>${heading}</h1><section id="descripcion"><p>${heading}</p></section><iframe sandbox="allow-scripts" title="${heading}" srcdoc="&lt;!doctype html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;meta http-equiv=&quot;Content-Security-Policy&quot; content=&quot;default-src &apos;none&apos;; script-src &apos;unsafe-inline&apos;; style-src &apos;unsafe-inline&apos;; connect-src &apos;none&apos;&quot;&gt;&lt;/head&gt;&lt;body&gt;&lt;p&gt;Vacío&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;"></iframe></article>`;
  }
  return `<article><h1>${heading}</h1></article>`;
}

type Piece =
  | {
      readonly ok: true;
      readonly inner: string;
      readonly article: string;
      readonly warnings: readonly NoteWarning[];
    }
  | NoteWriteFailure;

function sanitizeFragment(fragment: string, notePath: string, allowlist: readonly string[]): Piece {
  const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Fragmento</title><meta name="gaveta:id" content="${CARRIER_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="${CARRIER_CREATED}"></head><body>${bodyInner(fragment)}</body></html>`;
  const normalized = normalizeNote(shell, { notePath, remoteAllowlist: allowlist });
  if (normalized.html === null) {
    const failed = gate(asLikes(normalized.diagnostics));
    if (!failed.ok) {
      return failed;
    }
    throw new GavetaError('E_HTML_INVALID');
  }
  const failed = gate(asLikes(normalized.diagnostics));
  if (!failed.ok) {
    return failed;
  }
  return {
    ok: true,
    inner: wrapPiece(articleInner(normalized.html)),
    article: articleOuter(normalized.html).trim(),
    warnings: warningList(normalized.diagnostics),
  };
}

function wrapPiece(piece: string): string {
  const trimmed = piece.trim();
  if (trimmed.length === 0) {
    return '';
  }
  return `\n${trimmed}\n`;
}

function spliceNote(
  html: string,
  mode: EditMode,
  section: string | null,
  inner: string,
  article: string,
): string {
  const document = parseDocument(html);
  if (section === null) {
    const found = collectElements(document, (element) => elementName(element) === 'article');
    const target = found[0];
    if (found.length !== 1 || target === undefined) {
      throw new GavetaError('E_HTML_INVALID');
    }
    const spans = elementSpans(target);
    if (spans === null) {
      throw new GavetaError('E_HTML_INVALID');
    }
    return html.slice(0, spans.startTag.startOffset) + article + html.slice(spans.endTag.endOffset);
  }
  const article = collectElements(document, (element) => elementName(element) === 'article')[0];
  if (article === undefined) {
    throw new GavetaError('E_SECTION_NOT_FOUND');
  }
  const matches = collectElements(
    article,
    (element) => elementName(element) === 'section' && attr(element, 'id') === section,
  );
  if (matches.length === 0) {
    throw new GavetaError('E_SECTION_NOT_FOUND');
  }
  if (matches.length > 1) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const target = matches[0];
  if (target === undefined) {
    throw new GavetaError('E_SECTION_NOT_FOUND');
  }
  const spans = elementSpans(target);
  if (spans === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  if (mode === 'replace') {
    return html.slice(0, spans.startTag.endOffset) + inner + html.slice(spans.endTag.startOffset);
  }
  if (mode === 'prepend') {
    return html.slice(0, spans.startTag.endOffset) + inner + html.slice(spans.startTag.endOffset);
  }
  return html.slice(0, spans.endTag.startOffset) + inner + html.slice(spans.endTag.startOffset);
}

function hasMatchingLink(
  note: NoteModel,
  targetId: string,
  sectionId: string,
  text: string,
  rel: string | null,
): boolean {
  for (const link of note.links) {
    if (link.kind !== 'canonical' || link.targetId !== targetId) {
      continue;
    }
    if (link.sectionId !== sectionId || link.text !== text || link.rel !== rel) {
      continue;
    }
    return true;
  }
  return false;
}

function buildCanonicalAnchor(
  fromPath: string,
  toPath: string,
  toId: string,
  text: string,
  rel: string | null,
): string {
  const href = relativeNoteHref(fromPath, toPath);
  if (href === null) {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  const attrs = [`href="${escapeAttr(href)}"`, `data-g-to="${escapeAttr(toId)}"`];
  if (rel !== null) {
    attrs.push(`rel="${escapeAttr(rel)}"`);
  }
  return `<p><a ${attrs.join(' ')}>${escapeText(text)}</a></p>\n`;
}

function insertCanonicalLink(
  html: string,
  sectionId: string,
  explicitSection: boolean,
  anchor: string,
): string {
  if (sectionExists(html, sectionId)) {
    return spliceNote(html, 'append', sectionId, wrapPiece(anchor), '');
  }
  if (explicitSection) {
    throw new GavetaError('E_SECTION_NOT_FOUND');
  }
  const spans = articleSpans(html);
  const block = `\n<section id="${RELATED_SECTION_ID}"><h2>${escapeText(RELATED_SECTION_TITLE)}</h2>\n${anchor.trim()}\n</section>\n`;
  return html.slice(0, spans.endTag.startOffset) + block + html.slice(spans.endTag.startOffset);
}

function sectionExists(html: string, sectionId: string): boolean {
  const article = primaryArticle(html);
  if (article === null) {
    return false;
  }
  const matches = collectElements(
    article,
    (element) => elementName(element) === 'section' && attr(element, 'id') === sectionId,
  );
  return matches.length > 0;
}

function primaryArticle(html: string): ParseElement | null {
  const document = parseDocument(html);
  const articles = collectElements(document, (element) => elementName(element) === 'article');
  return articles[0] ?? null;
}

function presentLinkNote(
  session: Session,
  source: { readonly path: string; readonly title: string },
  note: NoteModel,
  original: string,
  section: string,
  added: boolean,
): LinkNoteSuccess {
  const resolved = resolveFor(session, original, source.path);
  if (note.id === null || note.type === null) {
    throw new GavetaError('E_META_MISSING');
  }
  return {
    ok: true,
    id: note.id,
    path: source.path,
    hash: noteContentHash(original),
    title: note.title ?? source.title,
    type: note.type,
    section,
    added,
    links: savedLinks(resolved.links, resolved.warnings, session.index),
    warnings: [...session.warnings, ...warningList(resolved.warnings)],
  };
}

function readLink(options: unknown): {
  readonly vaultRoot: string;
  readonly from: string;
  readonly to: string;
  readonly rel: string | null;
  readonly text: string | undefined;
  readonly section: string | undefined;
  readonly ifMatch: string | undefined;
} {
  const record = readRecord(options, LINK_KEYS);
  const rel = optionalRel(record.rel);
  const text = optionalLinkText(record.text);
  const section = optionalLinkSection(record.section);
  const ifMatch = optionalString(record.ifMatch);
  if (ifMatch !== undefined && !CONTENT_HASH.test(ifMatch)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return {
    vaultRoot: requiredString(record.vaultRoot),
    from: requiredString(record.from),
    to: requiredString(record.to),
    rel,
    text,
    section,
    ifMatch,
  };
}

function optionalRel(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return trimmed;
}

function optionalLinkText(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function optionalLinkSection(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function bodyInner(html: string): string {
  const document = parseDocument(html);
  const body = findBody(document);
  if (body === null) {
    return html;
  }
  const spans = elementSpans(body);
  if (spans === null) {
    return html;
  }
  return html.slice(spans.startTag.endOffset, spans.endTag.startOffset);
}

function articleInner(html: string): string {
  const spans = articleSpans(html);
  return html.slice(spans.startTag.endOffset, spans.endTag.startOffset);
}

function articleOuter(html: string): string {
  const spans = articleSpans(html);
  return html.slice(spans.startTag.startOffset, spans.endTag.endOffset);
}

function articleSpans(html: string): { readonly startTag: TagSpan; readonly endTag: TagSpan } {
  const document = parseDocument(html);
  const found = collectElements(document, (element) => elementName(element) === 'article');
  const article = found[0];
  if (article === undefined) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const spans = elementSpans(article);
  if (spans === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return spans;
}

function parseDocument(html: string): ParseDocument {
  return parse(html, { scriptingEnabled: false, sourceCodeLocationInfo: true });
}

function findBody(document: ParseDocument): ParseElement | null {
  for (const child of document.childNodes) {
    if (!isElementNode(child) || elementName(child) !== 'html') {
      continue;
    }
    for (const inner of child.childNodes) {
      if (isElementNode(inner) && elementName(inner) === 'body') {
        return inner;
      }
    }
  }
  return null;
}

function collectElements(
  root: ParseDocument | ParseElement,
  accept: (element: ParseElement) => boolean,
): ParseElement[] {
  const found: ParseElement[] = [];
  const stack: { nodes: readonly ParseChild[]; index: number }[] = [
    { nodes: root.childNodes, index: 0 },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) {
      return found;
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
    const name = elementName(node);
    if (name === 'script' || name === 'style' || name === 'template') {
      continue;
    }
    if (accept(node)) {
      found.push(node);
    }
    stack.push({ nodes: node.childNodes, index: 0 });
  }
  return found;
}

function elementSpans(
  element: ParseElement,
): { readonly startTag: TagSpan; readonly endTag: TagSpan } | null {
  const location: unknown = element.sourceCodeLocation;
  if (!isRecord(location)) {
    return null;
  }
  const startTag = spanOf(location.startTag);
  const endTag = spanOf(location.endTag);
  if (startTag === null || endTag === null) {
    return null;
  }
  if (startTag.endOffset > endTag.startOffset) {
    return null;
  }
  return { startTag, endTag };
}

function spanOf(value: unknown): TagSpan | null {
  if (!isRecord(value)) {
    return null;
  }
  const startOffset = value.startOffset;
  const endOffset = value.endOffset;
  if (
    typeof startOffset !== 'number' ||
    typeof endOffset !== 'number' ||
    startOffset < 0 ||
    endOffset < startOffset
  ) {
    return null;
  }
  return { startOffset, endOffset };
}

function elementName(element: ParseElement): string {
  return element.tagName.toLowerCase();
}

function attr(element: ParseElement, name: string): string | null {
  for (const attribute of element.attrs) {
    if (attribute.name.toLowerCase() === name) {
      return attribute.value;
    }
  }
  return null;
}

function isElementNode(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}

async function allocateNotePath(vaultRoot: string, folder: string, title: string): Promise<string> {
  const base = slugify(title);
  const stem = allocateSlug(base.length === 0 ? 'nota' : base, await takenStems(vaultRoot, folder));
  const file = `${stem}.html`;
  return folder.length === 0 ? file : `${folder}/${file}`;
}

async function takenStems(vaultRoot: string, folder: string): Promise<Set<string>> {
  const relative = folder.length === 0 ? '.' : folder;
  let absolute: string;
  try {
    absolute = await resolveInsideVault(vaultRoot, relative);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return new Set();
    }
    throw error;
  }
  let entries: Dirent[];
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return new Set();
    }
    if (hasNodeErrorCode(error, 'ENOTDIR')) {
      throw new GavetaError('E_PATH_EXISTS');
    }
    throw error;
  }
  const taken = new Set<string>();
  for (const entry of entries) {
    if (!entry.name.endsWith('.html')) {
      continue;
    }
    const stem = entry.name.slice(0, -'.html'.length);
    if (stem.length > 0) {
      taken.add(stem);
    }
  }
  return taken;
}

async function ensureDirectory(vaultRoot: string, directory: string): Promise<void> {
  if (directory.length === 0) {
    return;
  }
  const segments = directory.split('/');
  let prefix = '';
  for (const segment of segments) {
    prefix = prefix.length === 0 ? segment : `${prefix}/${segment}`;
    const absolute = await resolveInsideVault(vaultRoot, prefix);
    let listed: Awaited<ReturnType<typeof lstat>> | null = null;
    try {
      listed = await lstat(absolute);
    } catch (error) {
      if (!hasNodeErrorCode(error, 'ENOENT')) {
        throw error;
      }
    }
    if (listed === null) {
      await mkdir(absolute);
      continue;
    }
    if (listed.isSymbolicLink()) {
      throw new GavetaError('E_PATH_OUTSIDE_VAULT');
    }
    if (!listed.isDirectory()) {
      throw new GavetaError('E_PATH_EXISTS');
    }
  }
}

async function assertDestinationFree(vaultRoot: string, notePath: string): Promise<void> {
  const absolute = await resolveInsideVault(vaultRoot, notePath);
  try {
    await lstat(absolute);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  throw new GavetaError('E_PATH_EXISTS');
}

function savedLinks(
  links: readonly ResolvedLink[],
  warnings: readonly LinkDiagnostic[],
  index: VaultIndex,
): { readonly resolved: SavedLink[]; readonly pending: SavedLink[] } {
  const resolved: SavedLink[] = [];
  const pending: SavedLink[] = [];
  for (const link of links) {
    if (link.kind === 'canonical' && link.targetId !== null) {
      resolved.push({
        kind: 'canonical',
        text: link.text,
        title: link.text,
        id: link.targetId,
        path: onlyPath(notesForId(index, link.targetId)),
        href: link.href,
        suggestions: [],
      });
      continue;
    }
    if (link.kind !== 'pending') {
      continue;
    }
    const title = link.pendingTitle ?? link.text;
    pending.push({
      kind: 'pending',
      text: link.text,
      title,
      id: null,
      path: null,
      href: null,
      suggestions: suggestionsFor(title, warnings),
    });
  }
  return { resolved, pending };
}

function onlyPath(notes: readonly { readonly path: string }[]): string | null {
  if (notes.length !== 1) {
    return null;
  }
  return notes[0]?.path ?? null;
}

function suggestionsFor(title: string, warnings: readonly LinkDiagnostic[]): NoteSuggestion[] {
  for (const warning of warnings) {
    if (warning.code !== 'W_LINK_PENDING' || warning.details === null) {
      continue;
    }
    if (warning.details.title !== title) {
      continue;
    }
    const suggestions = warning.details.suggestions;
    if (!Array.isArray(suggestions)) {
      return [];
    }
    const parsed: NoteSuggestion[] = [];
    for (const suggestion of suggestions) {
      if (isSuggestion(suggestion)) {
        parsed.push(suggestion);
      }
    }
    return parsed;
  }
  return [];
}

function isSuggestion(value: unknown): value is NoteSuggestion {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (typeof value.id === 'string' || value.id === null) &&
    typeof value.title === 'string' &&
    typeof value.path === 'string' &&
    typeof value.score === 'number'
  );
}

type Gate = { readonly ok: true } | NoteWriteFailure;

function gate(diagnostics: readonly DiagnosticLike[]): Gate {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length === 0) {
    return { ok: true };
  }
  const coded = errors.find((diagnostic) => isErrorCode(diagnostic.code));
  if (coded !== undefined && isErrorCode(coded.code)) {
    throw errorFor(coded.code, coded.details);
  }
  const warnings: NoteWarning[] = [];
  for (const diagnostic of errors) {
    const warning = toWarning(diagnostic);
    if (warning !== null) {
      warnings.push(warning);
    }
  }
  return { ok: false, warnings };
}

function errorFor(code: ErrorCode, details: Readonly<Record<string, unknown>> | null): GavetaError {
  if (code === 'E_REF_AMBIGUOUS') {
    return new GavetaRefError(code, {}, { candidates: arrayField(details, 'candidates') });
  }
  return new GavetaError(code);
}

function arrayField(details: Readonly<Record<string, unknown>> | null, key: string): unknown[] {
  if (details === null) {
    return [];
  }
  const value = details[key];
  return Array.isArray(value) ? value : [];
}

function asLikes(
  diagnostics: readonly {
    readonly code: DiagnosticCode;
    readonly severity: 'error' | 'warning';
    readonly details: Readonly<Record<string, string | number>> | null;
  }[],
): DiagnosticLike[] {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    details: diagnostic.details,
  }));
}

function warningList(
  diagnostics: readonly {
    readonly code: DiagnosticCode;
    readonly severity: 'error' | 'warning';
    readonly details:
      Readonly<Record<string, unknown>> | Readonly<Record<string, string | number>> | null;
  }[],
): NoteWarning[] {
  const warnings: NoteWarning[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error') {
      continue;
    }
    const warning = toWarning({
      code: diagnostic.code,
      severity: diagnostic.severity,
      details: diagnostic.details,
    });
    if (warning !== null) {
      warnings.push(warning);
    }
  }
  return warnings;
}

function toWarning(diagnostic: DiagnosticLike): NoteWarning | null {
  if (!isWarningCode(diagnostic.code)) {
    return null;
  }
  const params: Record<string, string | number> = {};
  if (diagnostic.details !== null) {
    for (const [key, value] of Object.entries(diagnostic.details)) {
      if (typeof value === 'string' || typeof value === 'number') {
        params[key] = value;
      }
    }
  }
  return { code: diagnostic.code, params };
}

function toOutline(note: NoteModel): NoteOutline {
  return {
    sections: note.sections.map((section) => toOutlineSection(section)),
    tasks: note.tasks.map((task) => toOutlineTask(task)),
    links: note.links.map((link) => toOutlineLink(link)),
  };
}

function toOutlineSection(section: NoteSection): OutlineSection {
  return {
    id: section.id,
    heading: section.heading?.text ?? null,
    level: section.heading?.level ?? null,
    text: section.plainText,
    children: section.children.map((child) => toOutlineSection(child)),
  };
}

function toOutlineTask(task: NoteTask): OutlineTask {
  return {
    id: task.id,
    text: task.text,
    checked: task.checked,
    due: task.due,
    priority: task.priority,
    sectionId: task.sectionId,
  };
}

function toOutlineLink(link: NoteLink): OutlineLink {
  return {
    kind: link.kind,
    text: link.text,
    href: link.href,
    targetId: link.targetId,
    pendingTitle: link.pendingTitle,
    sectionId: link.sectionId,
  };
}

function assertMatch(current: string, expected: string | undefined): void {
  if (expected === undefined) {
    return;
  }
  if (current !== expected) {
    throw new GavetaError('E_CONFLICT');
  }
}

function readCreate(options: unknown): CreateInput {
  const record = readRecord(options, CREATE_KEYS);
  const vaultRoot = requiredString(record.vaultRoot);
  const title = requiredString(record.title).trim();
  if (title.length === 0 || title.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const typeValue = requiredString(record.type);
  if (!isNoteType(typeValue)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const nowValue = optionalString(record.now);
  const now = nowValue ?? new Date().toISOString();
  if (!isIso8601(now)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const idValue = optionalString(record.id);
  const id = idValue ?? createUlid();
  if (!isUlid(id)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const ifMatch = optionalString(record.ifMatch);
  if (ifMatch !== undefined && !CONTENT_HASH.test(ifMatch)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return {
    vaultRoot,
    title,
    type: typeValue,
    folder: folderPath(optionalString(record.folder)),
    tags: readNameList(record.tags),
    aliases: readNameList(record.aliases),
    html: optionalBody(record.html),
    ifMatch,
    now,
    id,
    artifactCdn: record.artifactCdn === true,
  };
}

function readRead(options: unknown): {
  readonly vaultRoot: string;
  readonly ref: string;
  readonly as: ReadAs;
} {
  const record = readRecord(options, READ_KEYS);
  const asValue = requiredString(record.as);
  if (asValue !== 'html' && asValue !== 'text' && asValue !== 'outline') {
    throw new GavetaError('E_ARG_INVALID');
  }
  return {
    vaultRoot: requiredString(record.vaultRoot),
    ref: requiredString(record.ref),
    as: asValue,
  };
}

function readEdit(options: unknown): {
  readonly vaultRoot: string;
  readonly ref: string;
  readonly html: string;
  readonly section: string | null;
  readonly mode: EditMode;
  readonly ifMatch: string | undefined;
} {
  const record = readRecord(options, EDIT_KEYS);
  const modeValue = requiredString(record.mode);
  if (modeValue !== 'replace' && modeValue !== 'append' && modeValue !== 'prepend') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const section = optionalString(record.section) ?? null;
  if (section === null && modeValue !== 'replace') {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (section !== null && (section.trim().length === 0 || section.includes('\0'))) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const html = requiredString(record.html);
  if (html.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const ifMatch = optionalString(record.ifMatch);
  if (ifMatch !== undefined && !CONTENT_HASH.test(ifMatch)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return {
    vaultRoot: requiredString(record.vaultRoot),
    ref: requiredString(record.ref),
    html,
    section,
    mode: modeValue,
    ifMatch,
  };
}

function folderPath(folder: string | undefined): string {
  if (folder === undefined || folder === '.' || folder.length === 0) {
    return '';
  }
  if (folder.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const inspected = inspectVaultPath(folder);
  if (!inspected.ok) {
    if (inspected.reason === 'unsafe-url') {
      throw new GavetaError('E_UNSAFE_URL');
    }
    if (inspected.reason === 'empty') {
      return '';
    }
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  return inspected.path;
}

function readNameList(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new GavetaError('E_ARG_INVALID');
    }
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.includes('\0') || trimmed.includes(',')) {
      throw new GavetaError('E_ARG_INVALID');
    }
    names.push(trimmed);
  }
  if (new Set(names).size !== names.length) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return names;
}

function readRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    record[key] = value[key];
  }
  return record;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function optionalBody(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createUlid(timestamp = Date.now()): string {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 2 ** 48) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const bytes = randomBytes(10);
  const time = BigInt(timestamp);
  let id = '';
  for (let shift = 45; shift >= 0; shift -= 5) {
    id += encodeDigit(Number((time >> BigInt(shift)) & 31n));
  }
  let random = 0n;
  for (const byte of bytes) {
    random = (random << 8n) | BigInt(byte);
  }
  for (let shift = 75; shift >= 0; shift -= 5) {
    id += encodeDigit(Number((random >> BigInt(shift)) & 31n));
  }
  return id;
}

function encodeDigit(value: number): string {
  const digit = ENCODING[value];
  if (digit === undefined) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return digit;
}
