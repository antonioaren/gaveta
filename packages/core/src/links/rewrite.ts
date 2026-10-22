import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { SUGGESTED_REL, isJavascriptUrl, isUlid, slugify } from '../contract.ts';
import { GavetaError } from '../errors.ts';
import { MAX_NOTE_DEPTH } from '../parser.ts';
import type { SourceLocation } from '../parser.ts';
import { foldMatchKey } from '../sqlite/schema.ts';
import { linkDiagnostic } from './diagnostic.ts';
import {
  appendFragment,
  escapeAttr,
  escapeText,
  fragmentOf,
  inspectVaultPath,
  isDataUrl,
  isProducedHref,
  relativeNoteHref,
  safeFragment,
} from './path.ts';
import { ambiguousDiagnostic, matchTitle, notesForId, type TitleMatch } from './ref.ts';
import { assessRel } from './rel.ts';
import { suggestNotes } from './suggest.ts';
import type {
  LinkDiagnostic,
  RelPolicy,
  ResolveNoteLinksOptions,
  ResolveNoteLinksResult,
  ResolvedLink,
} from './types.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseText = DefaultTreeAdapterMap['textNode'];

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface Context {
  readonly index: ResolveNoteLinksOptions['index'];
  readonly fromPath: string;
  readonly policy: RelPolicy;
  readonly allowPending: boolean;
  readonly edits: Edit[];
  readonly links: ResolvedLink[];
  readonly warnings: LinkDiagnostic[];
  readonly errors: LinkDiagnostic[];
}

interface WikilinkBody {
  readonly title: string;
  readonly section: string | null;
  readonly label: string | null;
}

const DEFAULT_POLICY: RelPolicy = { strict: false, vocabulary: [...SUGGESTED_REL] };

/**
 * Convert `[[...]]` to canonical or pending anchors, repair `href` from `data-g-to`,
 * and apply the vault `rel` policy. Existing `data-g-pending` anchors are not promoted.
 */
export function resolveNoteLinks(options: ResolveNoteLinksOptions): ResolveNoteLinksResult {
  if (typeof options.html !== 'string' || typeof options.fromPath !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const from = inspectVaultPath(options.fromPath);
  if (!from.ok) {
    throw pathFailure(from.reason);
  }
  const policy = policyOf(options.rel);
  const bom = options.html.startsWith('\uFEFF');
  const source = bom ? options.html.slice(1) : options.html;
  const context: Context = {
    index: options.index,
    fromPath: from.path,
    policy,
    allowPending: options.allowPending !== false,
    edits: [],
    links: [],
    warnings: [],
    errors: [],
  };
  let document: ParseDocument;
  try {
    document = parse(source, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  } catch {
    return failed(options.html, [linkDiagnostic('E_HTML_INVALID', null, {}, { reason: 'markup' })]);
  }
  const body = findBody(document);
  if (body !== null) {
    walk(body, source, context);
  }
  if (context.errors.length > 0) {
    return {
      ok: false,
      html: options.html,
      links: context.links,
      warnings: context.warnings,
      errors: context.errors,
    };
  }
  const edited = applyEdits(source, context.edits);
  return {
    ok: true,
    html: bom ? `\uFEFF${edited}` : edited,
    links: context.links,
    warnings: context.warnings,
    errors: context.errors,
  };
}

function walk(body: ParseElement, source: string, context: Context): void {
  const stack: { nodes: readonly ParseChild[]; index: number; depth: number; inCode: boolean }[] = [
    { nodes: body.childNodes, index: 0, depth: 0, inCode: false },
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
    if (isTextNode(node)) {
      if (!frame.inCode) {
        collectWikilinks(node, source, context);
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
    if (tag === 'a') {
      collectAnchor(node, source, context);
    }
    if (frame.depth >= MAX_NOTE_DEPTH) {
      continue;
    }
    stack.push({
      nodes: node.childNodes,
      index: 0,
      depth: frame.depth + 1,
      inCode: frame.inCode || tag === 'pre' || tag === 'code',
    });
  }
}

function collectWikilinks(node: ParseText, source: string, context: Context): void {
  const location = node.sourceCodeLocation;
  if (location === undefined || location === null) {
    return;
  }
  if (location.startOffset < 0 || location.endOffset > source.length) {
    return;
  }
  const raw = source.slice(location.startOffset, location.endOffset);
  let cursor = 0;
  while (cursor < raw.length) {
    const open = raw.indexOf('[[', cursor);
    if (open === -1) {
      break;
    }
    const close = raw.indexOf(']]', open + 2);
    if (close === -1) {
      break;
    }
    const parsed = parseWikilinkBody(decodeEntities(raw.slice(open + 2, close)));
    cursor = close + 2;
    if (parsed === null) {
      continue;
    }
    placeWikilink(
      parsed,
      location.startOffset + open,
      location.startOffset + close + 2,
      shiftLocation(location, raw, open),
      context,
    );
  }
}

function placeWikilink(
  parsed: WikilinkBody,
  start: number,
  end: number,
  location: SourceLocation,
  context: Context,
): void {
  const match = matchTitle(context.index, parsed.title);
  if (match.kind === 'many') {
    context.errors.push(ambiguousDiagnostic(match.notes, location));
    return;
  }
  if (match.kind === 'none') {
    placeMissing(parsed, start, end, location, context);
    return;
  }
  placeCanonical(match, parsed, start, end, location, context);
}

function placeMissing(
  parsed: WikilinkBody,
  start: number,
  end: number,
  location: SourceLocation,
  context: Context,
): void {
  const suggestions = suggestNotes(context.index, parsed.title);
  const text = parsed.label ?? parsed.title;
  if (!context.allowPending) {
    const suggestion = suggestions[0]?.title ?? '';
    context.errors.push(
      linkDiagnostic(
        'E_LINK_UNRESOLVED',
        location,
        { title: parsed.title, suggestion },
        { title: parsed.title, suggestion, suggestions },
      ),
    );
    context.links.push(pendingLink(parsed.title, text, null));
    return;
  }
  context.warnings.push(
    linkDiagnostic('W_LINK_PENDING', location, {}, { title: parsed.title, suggestions }),
  );
  context.edits.push({
    start,
    end,
    text: `<a data-g-pending="${escapeAttr(parsed.title)}">${escapeText(text)}</a>`,
  });
  context.links.push(pendingLink(parsed.title, text, null));
}

function placeCanonical(
  match: Extract<TitleMatch, { kind: 'one' }>,
  parsed: WikilinkBody,
  start: number,
  end: number,
  location: SourceLocation,
  context: Context,
): void {
  const note = match.note;
  if (note.id === null) {
    context.errors.push(
      linkDiagnostic('E_HTML_INVALID', location, {}, { reason: 'target-id', path: note.path }),
    );
    return;
  }
  const relative = relativeNoteHref(context.fromPath, note.path);
  if (relative === null || !isProducedHref(relative)) {
    context.errors.push(linkDiagnostic('E_PATH_OUTSIDE_VAULT', location, {}, { path: note.path }));
    return;
  }
  const section = sectionFragment(context.index, note.path, parsed.section);
  const href = appendFragment(relative, section);
  if (!isProducedHref(href)) {
    context.errors.push(linkDiagnostic('E_UNSAFE_URL', location, {}, null));
    return;
  }
  const text = parsed.label ?? note.title;
  context.edits.push({
    start,
    end,
    text: `<a href="${escapeAttr(href)}" data-g-to="${escapeAttr(note.id)}">${escapeText(text)}</a>`,
  });
  context.links.push({
    kind: 'canonical',
    href,
    targetId: note.id,
    pendingTitle: null,
    text,
    rel: null,
    section,
    ghost: false,
    broken: false,
    repairedHref: false,
  });
}

function collectAnchor(element: ParseElement, source: string, context: Context): void {
  const href = trimmedAttr(element, 'href');
  const targetId = trimmedAttr(element, 'data-g-to');
  const pending = trimmedAttr(element, 'data-g-pending');
  const rel = trimmedAttr(element, 'rel');
  const location = elementLocation(element);
  const text = elementText(element);
  const safety = href === null ? null : classifyHref(href);
  const link = anchorLink(href, text, rel);
  const insertions: string[] = [];

  if (targetId !== null) {
    repairTarget(element, source, targetId, href, location, context, link, insertions);
  } else if (pending !== null) {
    link.kind = 'pending';
    link.ghost = true;
    link.pendingTitle = pending;
    link.href = null;
    const suggestions = suggestNotes(context.index, pending);
    context.warnings.push(
      linkDiagnostic('W_LINK_PENDING', location, {}, { title: pending, suggestions }),
    );
  } else if (safety === 'unsafe') {
    link.kind = 'external';
    link.href = null;
    link.broken = true;
  } else if (safety === 'external') {
    link.kind = 'external';
  }

  const stillUnsafe = safety === 'unsafe' && !link.repairedHref;
  if (!stillUnsafe) {
    const external = safety === 'external' && !link.repairedHref;
    const assessment = assessRel(rel, context.policy, location, external);
    for (const diagnostic of assessment.diagnostics) {
      if (diagnostic.severity === 'error') {
        context.errors.push(diagnostic);
      } else {
        context.warnings.push(diagnostic);
      }
    }
    if (assessment.nextRel !== null) {
      link.rel = assessment.nextRel;
      const replaced = replaceAttribute(source, element, 'rel', assessment.nextRel);
      if (replaced !== null) {
        context.edits.push(replaced);
      } else {
        insertions.push(` rel="${escapeAttr(assessment.nextRel)}"`);
      }
    }
  }

  if (insertions.length > 0) {
    const inserted = insertAttributes(source, element, insertions.join(''));
    if (inserted !== null) {
      context.edits.push(inserted);
    }
  }
  if (link.href !== null && (isJavascriptUrl(link.href) || isDataUrl(link.href))) {
    link.href = null;
  }
  context.links.push(link);
}

function repairTarget(
  element: ParseElement,
  source: string,
  targetId: string,
  href: string | null,
  location: SourceLocation | null,
  context: Context,
  link: MutableLink,
  insertions: string[],
): void {
  link.kind = 'canonical';
  link.targetId = targetId;
  if (!isUlid(targetId)) {
    link.broken = true;
    return;
  }
  const matches = notesForId(context.index, targetId);
  if (matches.length > 1) {
    link.broken = true;
    context.errors.push(ambiguousDiagnostic(matches, location));
    return;
  }
  const note = matches[0];
  if (note === undefined) {
    link.broken = true;
    return;
  }
  if (note.id === null) {
    link.broken = true;
    context.errors.push(
      linkDiagnostic('E_HTML_INVALID', location, {}, { reason: 'target-id', path: note.path }),
    );
    return;
  }
  const relative = relativeNoteHref(context.fromPath, note.path);
  const fragment = fragmentOf(href);
  const rebuilt = relative === null ? null : appendFragment(relative, fragment);
  if (rebuilt === null || !isProducedHref(rebuilt)) {
    link.broken = true;
    context.errors.push(linkDiagnostic('E_PATH_OUTSIDE_VAULT', location, {}, { path: note.path }));
    return;
  }
  link.href = rebuilt;
  link.targetId = note.id;
  link.section = fragment;
  link.broken = false;
  if (href === rebuilt) {
    return;
  }
  link.repairedHref = true;
  const replaced = replaceAttribute(source, element, 'href', rebuilt);
  if (replaced !== null) {
    context.edits.push(replaced);
    return;
  }
  insertions.push(` href="${escapeAttr(rebuilt)}"`);
}

interface MutableLink {
  kind: ResolvedLink['kind'];
  href: string | null;
  targetId: string | null;
  pendingTitle: string | null;
  text: string;
  rel: string | null;
  section: string | null;
  ghost: boolean;
  broken: boolean;
  repairedHref: boolean;
}

function anchorLink(href: string | null, text: string, rel: string | null): MutableLink {
  return {
    kind: 'relative',
    href,
    targetId: null,
    pendingTitle: null,
    text,
    rel,
    section: fragmentOf(href),
    ghost: false,
    broken: false,
    repairedHref: false,
  };
}

function pendingLink(title: string, text: string, rel: string | null): ResolvedLink {
  return {
    kind: 'pending',
    href: null,
    targetId: null,
    pendingTitle: title,
    text,
    rel,
    section: null,
    ghost: true,
    broken: false,
    repairedHref: false,
  };
}

function sectionFragment(
  index: ResolveNoteLinksOptions['index'],
  notePath: string,
  raw: string | null,
): string | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const folded = foldMatchKey(trimmed);
  const slug = slugify(trimmed);
  for (const section of index.sections(notePath)) {
    const id = section.sectionId;
    if (id !== null && (id === trimmed || id === slug || foldMatchKey(id) === folded)) {
      return safeFragment(id);
    }
    if (section.heading !== null && foldMatchKey(section.heading) === folded && id !== null) {
      return safeFragment(id);
    }
  }
  return safeFragment(slug);
}

function classifyHref(href: string): 'external' | 'internal' | 'unsafe' {
  if (isJavascriptUrl(href) || isDataUrl(href) || /^file:/i.test(href)) {
    return 'unsafe';
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href.trim()) || href.trim().startsWith('//')) {
    return 'external';
  }
  return 'internal';
}

function replaceAttribute(
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
    return { start: span.startOffset, end: span.endOffset, text: `${name}="${escapeAttr(value)}"` };
  }
  let cursor = eq + 1;
  while (cursor < raw.length && isSpace(raw[cursor])) {
    cursor += 1;
  }
  const quote = raw[cursor];
  if (quote !== '"' && quote !== "'") {
    return { start: span.startOffset, end: span.endOffset, text: `${name}="${escapeAttr(value)}"` };
  }
  const valueStart = span.startOffset + cursor + 1;
  const valueEnd = source[span.endOffset - 1] === quote ? span.endOffset - 1 : span.endOffset;
  return { start: valueStart, end: valueEnd, text: escapeAttr(value) };
}

function insertAttributes(source: string, element: ParseElement, text: string): Edit | null {
  const startTag = element.sourceCodeLocation?.startTag;
  if (startTag === undefined) {
    return null;
  }
  const end = startTag.endOffset;
  if (end < 1 || end > source.length || source[end - 1] !== '>') {
    return null;
  }
  return { start: end - 1, end: end - 1, text };
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

function policyOf(rel: RelPolicy | undefined): RelPolicy {
  if (rel === undefined) {
    return DEFAULT_POLICY;
  }
  if (typeof rel.strict !== 'boolean' || !Array.isArray(rel.vocabulary)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const vocabulary: string[] = [];
  for (const token of rel.vocabulary) {
    if (typeof token !== 'string' || token.trim() === '' || token.trim() !== token) {
      throw new GavetaError('E_ARG_INVALID');
    }
    vocabulary.push(token);
  }
  return { strict: rel.strict, vocabulary };
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

function failed(html: string, errors: readonly LinkDiagnostic[]): ResolveNoteLinksResult {
  return { ok: false, html, links: [], warnings: [], errors };
}

/** Same grammar as `parseNote`: `title`, optional `#section`, optional `|label`. */
function parseWikilinkBody(body: string): WikilinkBody | null {
  if (body.includes('\n') || body.includes('[') || body.includes(']')) {
    return null;
  }
  const pipe = body.indexOf('|');
  const target = pipe === -1 ? body : body.slice(0, pipe);
  const label = pipe === -1 ? null : blankToNull(body.slice(pipe + 1));
  if (pipe !== -1 && label === null) {
    return null;
  }
  const hash = target.indexOf('#');
  const title = (hash === -1 ? target : target.slice(0, hash)).trim();
  const section = hash === -1 ? null : blankToNull(target.slice(hash + 1));
  if (title.length === 0 || (hash !== -1 && section === null)) {
    return null;
  }
  return { title, section, label };
}

function decodeEntities(value: string): string {
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '&') {
      out += character ?? '';
      continue;
    }
    const semi = value.indexOf(';', index + 1);
    if (semi === -1 || semi - index > 12) {
      out += '&';
      continue;
    }
    const decoded = decodeEntity(value.slice(index + 1, semi));
    if (decoded === null) {
      out += '&';
      continue;
    }
    out += decoded;
    index = semi;
  }
  return out;
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

function elementLocation(element: ParseElement): SourceLocation | null {
  const location = element.sourceCodeLocation;
  if (location === undefined || location === null) {
    return null;
  }
  return { line: location.startLine, column: location.startCol };
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

function shiftLocation(
  start: { startLine: number; startCol: number },
  raw: string,
  index: number,
): SourceLocation {
  let line = start.startLine;
  let column = start.startCol;
  const end = Math.min(index, raw.length);
  for (let offset = 0; offset < end; offset += 1) {
    if (raw[offset] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
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

function blankToNull(value: string): string | null {
  const text = value.trim();
  return text.length === 0 ? null : text;
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
