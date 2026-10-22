/**
 * Canonical note serializer.
 * Strips unsafe markup, inline styles, and classes outside the contract,
 * fills missing section and task ids, and points the theme stylesheet at
 * the note's depth. Parsing never executes scripts or fetches URLs.
 * A note that already validates and needs no repair is returned unchanged,
 * so fixture bytes stay stable across a save.
 */
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  DOCUMENT_SHELL,
  INLINE_STYLE_ATTRIBUTE,
  allocateSlug,
  isAllowedAttribute,
  isAllowedBodyElement,
  isAllowedClass,
  isCalloutKind,
  isEventHandlerAttribute,
  isIso8601,
  isJavascriptUrl,
  isNoteType,
  isRemoteUrl,
  isTaskPriority,
  isUlid,
  slugify,
  type NoteType,
} from './contract.ts';
import { DIAGNOSTICS, formatDiagnostic, type DiagnosticCode } from './errors.ts';
import { MAX_NOTE_DEPTH, MAX_NOTE_HTML_CHARS, type NoteDiagnostic } from './parser.ts';
import {
  cssResourceUrls,
  isExternalAnchorHref,
  isSafeVaultNotePath,
  metaRefreshUrl,
  referenceEscapesVault,
  remoteUrlIsAllowed,
  validateNote,
  type ValidateNoteOptions,
} from './validate.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseTemplate = DefaultTreeAdapterMap['template'];
type ParseText = DefaultTreeAdapterMap['textNode'];

export interface NormalizeNoteOptions {
  /** Vault-relative note path. Sets the theme href and judges `..` escapes. */
  readonly notePath?: string;
  /** Hosts that may keep a remote `img` or `source` URL. Anchors are exempt. */
  readonly remoteAllowlist?: readonly string[];
}

export interface NormalizeResult {
  readonly ok: boolean;
  readonly html: string | null;
  readonly diagnostics: readonly NoteDiagnostic[];
}

interface NormAttr {
  name: string;
  value: string;
}

interface NormText {
  readonly kind: 'text';
  value: string;
}

interface NormElement {
  readonly kind: 'element';
  tag: string;
  attrs: NormAttr[];
  children: NormChild[];
  readonly void: boolean;
}

type NormChild = NormText | NormElement;

interface ParentInfo {
  readonly tag: string | null;
  readonly classes: readonly string[];
  readonly inPre: boolean;
  readonly inTask: boolean;
}

interface State {
  contentRepair: boolean;
  formatRepair: boolean;
  styleCount: number;
  classCount: number;
  unsafeCount: number;
  remotes: { element: string; attribute: string; url: string }[];
  errors: NoteDiagnostic[];
  notePath: string | null;
  allowlist: readonly string[];
  type: NoteType | null;
  keptTheme: string | null;
}

interface BuiltNote {
  readonly lang: string;
  readonly title: string | null;
  readonly meta: ReadonlyMap<string, string>;
  readonly theme: string;
  readonly body: readonly NormChild[];
}

const THEME_FILE = DOCUMENT_SHELL.theme.path;

const META_ORDER = [
  'gaveta:id',
  'gaveta:type',
  'gaveta:tags',
  'gaveta:aliases',
  'gaveta:created',
  'gaveta:updated',
  'gaveta:artifact-cdn',
] as const;

const HEAD_ORDER = ['charset', 'title', ...META_ORDER, 'theme'];

const VOID_TAGS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'article',
  'aside',
  'blockquote',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
  'gaveta-embed',
]);

const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'action',
  'cite',
  'data',
  'formaction',
  'href',
  'poster',
  'src',
  'srcset',
]);

const BOOLEAN_ATTRIBUTES: ReadonlySet<string> = new Set(['checked', 'data-g-task']);

const ATTR_ORDER: Readonly<Record<string, readonly string[]>> = {
  a: ['href', 'id', 'class', 'title', 'lang', 'data-g-to', 'data-g-pending', 'rel'],
  aside: ['class', 'id', 'title', 'lang', 'data-kind'],
  code: ['class', 'id', 'title'],
  img: ['src', 'alt', 'id', 'class', 'title'],
  input: ['type', 'checked', 'id', 'class', 'title'],
  li: ['data-g-task', 'id', 'class', 'title', 'lang', 'data-g-due', 'data-g-priority'],
  meta: ['charset', 'http-equiv', 'name', 'content'],
  pre: ['class', 'id', 'title'],
  section: ['class', 'id', 'title', 'lang'],
  source: ['src', 'type', 'id', 'class'],
  td: ['colspan', 'rowspan', 'id', 'class', 'title'],
  th: ['colspan', 'rowspan', 'id', 'class', 'title'],
  time: ['datetime', 'id', 'class', 'title'],
  ul: ['class', 'id', 'title', 'lang'],
};

const DEFAULT_ATTR_ORDER = [
  'id',
  'class',
  'title',
  'lang',
  'href',
  'src',
  'alt',
  'type',
  'rel',
  'datetime',
  'colspan',
  'rowspan',
  'checked',
  'data-kind',
  'data-g-task',
  'data-g-to',
  'data-g-pending',
  'data-g-section',
  'data-g-due',
  'data-g-priority',
];

const ROOT_PARENT: ParentInfo = { tag: null, classes: [], inPre: false, inTask: false };

export function normalizeNote(input: unknown, options: NormalizeNoteOptions = {}): NormalizeResult {
  if (typeof input !== 'string') {
    return reject({ reason: 'input' });
  }
  const source = input.startsWith('\uFEFF') ? input.slice(1) : input;
  if (source.length > MAX_NOTE_HTML_CHARS) {
    return reject({ reason: 'size', length: source.length });
  }

  let document: ParseDocument;
  try {
    document = parse(source, { scriptingEnabled: false });
  } catch {
    return reject({ reason: 'markup' });
  }

  const state = createState(options);
  const built = buildNote(document, state);
  const html = serializeDocument(built);
  if (canPreserve(source, state, options)) {
    return { ok: true, html: source, diagnostics: [] };
  }
  return {
    ok: state.errors.length === 0,
    html,
    diagnostics: [...state.errors, ...warningDiagnostics(state)],
  };
}

function reject(details: Readonly<Record<string, string | number>>): NormalizeResult {
  return {
    ok: false,
    html: null,
    diagnostics: [makeDiagnostic('E_HTML_INVALID', details)],
  };
}

function createState(options: NormalizeNoteOptions): State {
  const state: State = {
    contentRepair: false,
    formatRepair: false,
    styleCount: 0,
    classCount: 0,
    unsafeCount: 0,
    remotes: [],
    errors: [],
    notePath: null,
    allowlist: options.remoteAllowlist ?? [],
    type: null,
    keptTheme: null,
  };
  if (options.notePath === undefined) {
    return state;
  }
  if (!isSafeVaultNotePath(options.notePath)) {
    state.errors.push(makeDiagnostic('E_ARG_INVALID', { field: 'notePath' }));
    state.contentRepair = true;
    return state;
  }
  state.notePath = options.notePath;
  return state;
}

function canPreserve(source: string, state: State, options: NormalizeNoteOptions): boolean {
  if (state.contentRepair || state.formatRepair || state.errors.length > 0) {
    return false;
  }
  if (!houseFormatted(source)) {
    return false;
  }
  return validateNote(source, validationOptions(state, options)).ok;
}

function validationOptions(state: State, options: NormalizeNoteOptions): ValidateNoteOptions {
  const next: { notePath?: string; remoteAllowlist?: readonly string[] } = {};
  if (state.notePath !== null) {
    next.notePath = state.notePath;
  }
  if (options.remoteAllowlist !== undefined) {
    next.remoteAllowlist = options.remoteAllowlist;
  }
  return next;
}

function houseFormatted(source: string): boolean {
  if (
    !source.startsWith('<!doctype html>\n') ||
    !source.endsWith('\n') ||
    source.endsWith('\n\n')
  ) {
    return false;
  }
  if (source.includes('\r') || source.includes('\t')) {
    return false;
  }
  if (!source.includes('\n  <head>\n') || !source.includes('\n  <body>\n')) {
    return false;
  }
  for (const line of source.split('\n')) {
    let spaces = 0;
    while (spaces < line.length && line[spaces] === ' ') {
      spaces += 1;
    }
    if (spaces % 2 !== 0) {
      return false;
    }
  }
  return true;
}

function buildNote(document: ParseDocument, state: State): BuiltNote {
  const html = findChild(document, 'html');
  const head = html === null ? null : findChildElement(html, 'head');
  const body = html === null ? null : findChildElement(html, 'body');
  const extracted = extractHead(head, state);
  let children = body === null ? [] : convertChildren(body.childNodes, 3, state, ROOT_PARENT);
  if (body !== null && body.attrs.length > 0) {
    state.contentRepair = true;
  }
  children = ensureStructure(children, state);
  repairTree(children, state);
  assignIds(children, state);
  const theme =
    state.notePath !== null ? themeHref(state.notePath) : (state.keptTheme ?? themeHref(null));
  return {
    lang: extracted.lang,
    title: extracted.title,
    meta: extracted.meta,
    theme,
    body: children,
  };
}

/** Stylesheet href for a note at `notePath`, relative to that note. */
export function themeStylesheetHref(notePath: string): string {
  const depth = notePath.split('/').length - 1;
  return `${'../'.repeat(depth)}${THEME_FILE}`;
}

function themeHref(notePath: string | null): string {
  if (notePath === null) {
    return THEME_FILE;
  }
  return themeStylesheetHref(notePath);
}

function isThemeHref(value: string): boolean {
  let rest = value;
  while (rest.startsWith('../')) {
    rest = rest.slice(3);
  }
  return rest === THEME_FILE;
}

interface HeadExtract {
  lang: string;
  title: string | null;
  meta: Map<string, string>;
}

function extractHead(head: ParseElement | null, state: State): HeadExtract {
  const parent = head?.parentNode ?? null;
  const html = parent !== null && 'tagName' in parent ? parent : null;
  let lang = 'es';
  if (html !== null && html.tagName.toLowerCase() === 'html') {
    const raw = attribute(html, 'lang');
    if (raw === null || raw.trim().length === 0) {
      state.formatRepair = true;
    } else {
      lang = raw.trim();
      if (lang !== raw) {
        state.formatRepair = true;
      }
    }
    for (const attr of html.attrs) {
      if (attr.name.toLowerCase() !== 'lang') {
        state.contentRepair = true;
      }
    }
  } else {
    state.formatRepair = true;
  }

  const meta = new Map<string, string>();
  const seen = new Set<string>();
  const signatures: string[] = [];
  const stylesheets: string[] = [];
  if (head !== null) {
    for (const child of head.childNodes) {
      if (!isElementNode(child)) {
        continue;
      }
      const tag = child.tagName.toLowerCase();
      noteUnsafeAttributes(child, tag, state);
      if (isForbiddenTag(tag, state.type) || tag === 'style') {
        if (isForbiddenTag(tag, state.type)) {
          state.unsafeCount += 1;
        }
        if (tag === 'style') {
          noteCss(elementText(child), tag, state);
        } else {
          noteResourceAttributes(child, tag, state);
        }
        state.contentRepair = true;
        continue;
      }
      if (tag === 'meta') {
        readMeta(child, meta, seen, signatures, state);
        continue;
      }
      if (tag === 'title') {
        readTitle(child, meta, signatures, state);
        continue;
      }
      if (tag === 'link') {
        readLink(child, stylesheets, signatures, state);
        continue;
      }
      state.contentRepair = true;
    }
  }

  const onlySheet = stylesheets.length === 1 ? stylesheets[0] : undefined;
  if (stylesheets.length === 1 && onlySheet !== undefined && isThemeHref(onlySheet)) {
    state.keptTheme = onlySheet;
  }
  const expected = state.notePath === null ? null : themeHref(state.notePath);
  if (expected !== null) {
    if (onlySheet !== expected) {
      state.contentRepair = true;
    }
  } else if (onlySheet === undefined || !isThemeHref(onlySheet)) {
    state.contentRepair = true;
  }
  if (!signatures.includes('charset')) {
    state.contentRepair = true;
  }
  if (!headSignaturesInOrder(signatures)) {
    state.formatRepair = true;
  }

  let title: string | null = null;
  const titleValue = meta.get('title');
  if (titleValue !== undefined) {
    title = titleValue;
    meta.delete('title');
  }
  const rawType = meta.get('gaveta:type');
  if (rawType !== undefined && isNoteType(rawType)) {
    state.type = rawType;
  }
  return { lang, title, meta };
}

function readMeta(
  element: ParseElement,
  meta: Map<string, string>,
  seen: Set<string>,
  signatures: string[],
  state: State,
): void {
  const charset = attribute(element, 'charset');
  if (charset !== null) {
    signatures.push('charset');
    if (charset.trim().toLowerCase() !== 'utf-8') {
      state.contentRepair = true;
    } else if (charset !== 'utf-8') {
      state.formatRepair = true;
    }
    if (element.attrs.some((attr) => attr.name.toLowerCase() !== 'charset')) {
      state.contentRepair = true;
    }
    return;
  }
  const equiv = attribute(element, 'http-equiv');
  if (equiv !== null) {
    state.contentRepair = true;
    const target = metaRefreshUrl(attribute(element, 'content') ?? '');
    if (target !== null) {
      noteUrl('meta', 'content', target, state);
    }
    return;
  }
  const name = attribute(element, 'name');
  const content = attribute(element, 'content');
  if (name === null || content === null) {
    state.contentRepair = true;
    return;
  }
  const key = name.trim().toLowerCase();
  const names = element.attrs
    .map((attr) => attr.name.toLowerCase())
    .filter((attr) => attr === 'name' || attr === 'content');
  if (names.join(',') !== 'name,content') {
    state.formatRepair = true;
  }
  if (element.attrs.some((attr) => !['name', 'content'].includes(attr.name.toLowerCase()))) {
    state.contentRepair = true;
  }
  if (!(META_ORDER as readonly string[]).includes(key)) {
    state.contentRepair = true;
    return;
  }
  const value = content.trim();
  if (value !== content) {
    state.formatRepair = true;
  }
  if (value.length === 0) {
    state.contentRepair = true;
    return;
  }
  signatures.push(key);
  if (seen.has(key)) {
    state.contentRepair = true;
    return;
  }
  seen.add(key);
  meta.set(key, value);
}

function readTitle(
  element: ParseElement,
  meta: Map<string, string>,
  signatures: string[],
  state: State,
): void {
  if (element.attrs.length > 0) {
    state.contentRepair = true;
  }
  const raw = elementText(element);
  const collapsed = collapse(raw);
  if (collapsed !== raw.trim()) {
    state.formatRepair = true;
  }
  if (collapsed.length === 0) {
    state.contentRepair = true;
    return;
  }
  signatures.push('title');
  if (meta.has('title')) {
    state.contentRepair = true;
    return;
  }
  meta.set('title', collapsed);
}

function readLink(
  element: ParseElement,
  stylesheets: string[],
  signatures: string[],
  state: State,
): void {
  const rel = attribute(element, 'rel');
  const href = attribute(element, 'href');
  const tokens = relTokens(rel);
  const sheet = tokens.length === 1 && tokens[0]?.toLowerCase() === 'stylesheet';
  const names = element.attrs.map((attr) => attr.name.toLowerCase());
  if (names.some((name) => name !== 'rel' && name !== 'href')) {
    state.contentRepair = true;
  }
  if (!sheet || href === null) {
    state.contentRepair = true;
    if (href !== null) {
      noteUrl('link', 'href', href, state);
    }
    return;
  }
  if (names.filter((name) => name === 'rel' || name === 'href').join(',') !== 'rel,href') {
    state.formatRepair = true;
  }
  if (rel !== 'stylesheet') {
    state.formatRepair = true;
  }
  const trimmed = href.trim();
  if (trimmed !== href) {
    state.formatRepair = true;
  }
  noteUrl('link', 'href', trimmed, state, true);
  stylesheets.push(trimmed);
  signatures.push('theme');
}

function headSignaturesInOrder(signatures: string[]): boolean {
  let last = -1;
  for (const signature of signatures) {
    const index = HEAD_ORDER.indexOf(signature);
    if (index === -1 || index <= last) {
      return false;
    }
    last = index;
  }
  return true;
}

function convertChildren(
  nodes: readonly ParseChild[],
  depth: number,
  state: State,
  parent: ParentInfo,
): NormChild[] {
  if (depth > MAX_NOTE_DEPTH) {
    state.contentRepair = true;
    return [];
  }
  const out: NormChild[] = [];
  for (const node of nodes) {
    if (isTextNode(node)) {
      const value = node.value.replace(/\r\n?/g, '\n').replaceAll('\0', '');
      if (value !== node.value) {
        state.contentRepair = true;
      }
      if (value.length > 0) {
        out.push({ kind: 'text', value });
      }
      continue;
    }
    if (!isElementNode(node)) {
      continue;
    }
    out.push(...convertElement(node, depth, state, parent));
  }
  return out;
}

function convertElement(
  element: ParseElement,
  depth: number,
  state: State,
  parent: ParentInfo,
): NormChild[] {
  const tag = element.tagName.toLowerCase();
  noteUnsafeAttributes(element, tag, state);
  if (isForbiddenTag(tag, state.type)) {
    state.unsafeCount += 1;
    state.contentRepair = true;
    noteResourceAttributes(element, tag, state);
    if (tag === 'form') {
      return convertChildren(childNodesOf(element), depth + 1, state, parent);
    }
    return [];
  }
  if (!isAllowedBodyElement(tag)) {
    state.contentRepair = true;
    if (tag === 'style') {
      noteCss(elementText(element), tag, state);
      return [];
    }
    return convertChildren(childNodesOf(element), depth + 1, state, parent);
  }
  if (tag === 'input' && !parent.inTask) {
    state.contentRepair = true;
    noteResourceAttributes(element, tag, state);
    return [];
  }

  const attrs = sanitizeAttrs(element, tag, state);
  if (tag === 'gaveta-embed' && !validEmbed(attrs)) {
    state.contentRepair = true;
    return [];
  }
  repairCallout(tag, attrs, state);
  repairSpans(tag, attrs, state);
  repairTime(tag, attrs, state);
  repairTaskAttrs(tag, attrs, state);
  repairSource(tag, attrs, state);
  if (tag === 'a' && !repairAnchor(attrs, state)) {
    return convertChildren(element.childNodes, depth + 1, state, parent);
  }
  if (tag === 'img') {
    const replaced = repairImage(attrs, state);
    if (replaced !== null) {
      return replaced;
    }
  }
  if (
    tag === 'source' &&
    attributeValue(attrs, 'src') === null &&
    attributeValue(attrs, 'type') === null
  ) {
    state.contentRepair = true;
    return [];
  }

  const classes = classTokens(attrs);
  const childParent: ParentInfo = {
    tag,
    classes,
    inPre: parent.inPre || tag === 'pre',
    inTask:
      parent.inTask ||
      (tag === 'li' &&
        (attributeValue(attrs, 'data-g-task') !== null ||
          (parent.tag === 'ul' && parent.classes.includes('tasks')))),
  };
  const children = VOID_TAGS.has(tag)
    ? []
    : convertChildren(element.childNodes, depth + 1, state, childParent);
  return [{ kind: 'element', tag, attrs, children, void: VOID_TAGS.has(tag) }];
}

function sanitizeAttrs(element: ParseElement, tag: string, state: State): NormAttr[] {
  const kept: NormAttr[] = [];
  let classRaw: string | null = null;
  for (const attr of element.attrs) {
    const name = attr.name.toLowerCase();
    if (isEventHandlerAttribute(name) || name === INLINE_STYLE_ATTRIBUTE) {
      continue;
    }
    if (name === 'class') {
      classRaw = attr.value;
      continue;
    }
    if (!isAllowedAttribute(tag, name)) {
      state.contentRepair = true;
      forEachUrl(name, attr.value, (url) => {
        noteUrl(tag, name, url, state);
      });
      continue;
    }
    const normalized = normalizeAttr(tag, name, attr.value, state);
    if (normalized !== null) {
      kept.push(normalized);
    }
  }
  const classAttr = normalizeClass(tag, classRaw, state);
  if (classAttr !== null) {
    kept.push(classAttr);
  }
  if (
    !namesInOrder(
      tag,
      element.attrs
        .map((attr) => attr.name.toLowerCase())
        .filter((name) => kept.some((attr) => attr.name === name)),
    )
  ) {
    const originalKept = element.attrs
      .map((attr) => attr.name.toLowerCase())
      .filter((name) => kept.some((attr) => attr.name === name));
    const sorted = sortAttrs(tag, kept).map((attr) => attr.name);
    if (originalKept.join(',') !== sorted.join(',')) {
      state.formatRepair = true;
    }
  }
  return sortAttrs(tag, kept);
}

function normalizeAttr(tag: string, name: string, raw: string, state: State): NormAttr | null {
  let value = raw.replaceAll('\0', '');
  if (value !== raw) {
    state.contentRepair = true;
  }
  if (name === 'href' && tag === 'a' && isJavascriptUrl(value)) {
    state.unsafeCount += 1;
    state.contentRepair = true;
    return null;
  }
  if (isResourceAttribute(tag, name) && isJavascriptUrl(value)) {
    state.unsafeCount += 1;
    state.contentRepair = true;
    return null;
  }
  if (
    isResourceAttribute(tag, name) &&
    isRemoteUrl(value) &&
    !remoteUrlIsAllowed(value, state.allowlist)
  ) {
    state.remotes.push({ element: tag, attribute: name, url: value.trim() });
    state.contentRepair = true;
    return null;
  }
  if (
    isResourceAttribute(tag, name) &&
    referenceEscapesVault(value, state.notePath) &&
    tag !== 'a'
  ) {
    state.contentRepair = true;
    return null;
  }
  const trimmed = value.trim();
  if (trimmed !== value) {
    state.formatRepair = true;
    value = trimmed;
  }
  if (name === 'type' && tag === 'input') {
    const lower = value.toLowerCase();
    if (lower !== value) {
      state.formatRepair = true;
      value = lower;
    }
  }
  if (name === 'checked') {
    if (value !== '' && value.toLowerCase() !== 'checked') {
      state.formatRepair = true;
    } else if (value !== '') {
      state.formatRepair = true;
    }
    value = '';
  }
  if (name === 'data-g-task' && value.trim() === '') {
    value = '';
  }
  return { name, value };
}

function normalizeClass(tag: string, raw: string | null, state: State): NormAttr | null {
  if (raw === null) {
    return null;
  }
  const kept: string[] = [];
  for (const token of raw.split(/\s+/)) {
    if (token.length === 0) {
      continue;
    }
    if (isAllowedClass(tag, token) && !kept.includes(token)) {
      kept.push(token);
      continue;
    }
    if (!isAllowedClass(tag, token)) {
      state.classCount += 1;
      state.contentRepair = true;
      continue;
    }
    state.formatRepair = true;
  }
  if (kept.length === 0) {
    if (raw.trim().length > 0) {
      state.contentRepair = true;
    }
    return null;
  }
  const serialized = kept.join(' ');
  if (serialized !== raw.trim().replace(/\s+/g, ' ') && state.classCount === 0) {
    state.formatRepair = true;
  }
  return { name: 'class', value: serialized };
}

function repairAnchor(attrs: NormAttr[], state: State): boolean {
  const href = attributeValue(attrs, 'href');
  if (href !== null && referenceEscapesVault(href, state.notePath)) {
    setAttr(attrs, 'href', '#');
    state.contentRepair = true;
  }
  const target = attributeValue(attrs, 'data-g-to');
  if (target !== null && !isUlid(target)) {
    removeAttr(attrs, 'data-g-to');
    state.contentRepair = true;
  }
  if (
    attributeValue(attrs, 'data-g-to') !== null &&
    attributeValue(attrs, 'data-g-pending') !== null
  ) {
    removeAttr(attrs, 'data-g-pending');
    state.contentRepair = true;
  }
  if (attributeValue(attrs, 'data-g-to') !== null && attributeValue(attrs, 'href') === null) {
    setAttr(attrs, 'href', '#');
    state.contentRepair = true;
  }
  const nextHref = attributeValue(attrs, 'href');
  if (
    nextHref === null &&
    attributeValue(attrs, 'data-g-to') === null &&
    attributeValue(attrs, 'data-g-pending') === null
  ) {
    state.contentRepair = true;
    return false;
  }
  if (nextHref !== null && isExternalAnchorHref(nextHref)) {
    const tokens = relTokens(attributeValue(attrs, 'rel'));
    if (!tokens.includes('noopener')) {
      tokens.push('noopener');
      setAttr(attrs, 'rel', tokens.join(' '));
      state.contentRepair = true;
    }
  }
  return true;
}

function repairImage(attrs: NormAttr[], state: State): NormChild[] | null {
  if (attributeValue(attrs, 'alt') === null) {
    setAttr(attrs, 'alt', '');
    state.contentRepair = true;
  }
  if (attributeValue(attrs, 'src') !== null) {
    return null;
  }
  state.contentRepair = true;
  const alt = attributeValue(attrs, 'alt');
  if (alt !== null && alt.length > 0) {
    return [{ kind: 'text', value: alt }];
  }
  return [];
}

function repairCallout(tag: string, attrs: NormAttr[], state: State): void {
  if (tag !== 'aside') {
    return;
  }
  const classes = classTokens(attrs);
  const kind = attributeValue(attrs, 'data-kind');
  if (classes.includes('callout')) {
    if (kind === null || !isCalloutKind(kind)) {
      setClassTokens(
        attrs,
        classes.filter((token) => token !== 'callout'),
      );
      removeAttr(attrs, 'data-kind');
      state.contentRepair = true;
    }
    return;
  }
  if (kind !== null) {
    removeAttr(attrs, 'data-kind');
    state.contentRepair = true;
  }
}

function repairSpans(tag: string, attrs: NormAttr[], state: State): void {
  if (tag !== 'th' && tag !== 'td') {
    return;
  }
  for (const name of ['colspan', 'rowspan']) {
    const value = attributeValue(attrs, name);
    if (value !== null && !/^[1-9][0-9]*$/.test(value)) {
      removeAttr(attrs, name);
      state.contentRepair = true;
    }
  }
}

function repairTime(tag: string, attrs: NormAttr[], state: State): void {
  if (tag !== 'time') {
    return;
  }
  const datetime = attributeValue(attrs, 'datetime');
  if (datetime !== null && !isIso8601(datetime)) {
    removeAttr(attrs, 'datetime');
    state.contentRepair = true;
  }
}

function repairTaskAttrs(tag: string, attrs: NormAttr[], state: State): void {
  if (tag !== 'li') {
    return;
  }
  const due = attributeValue(attrs, 'data-g-due');
  if (due !== null && !isIso8601(due)) {
    removeAttr(attrs, 'data-g-due');
    state.contentRepair = true;
  }
  const priority = attributeValue(attrs, 'data-g-priority');
  if (priority !== null && !isTaskPriority(priority)) {
    removeAttr(attrs, 'data-g-priority');
    state.contentRepair = true;
  }
}

function repairSource(tag: string, attrs: NormAttr[], state: State): void {
  if (tag !== 'source') {
    return;
  }
  const sourceType = attributeValue(attrs, 'type');
  if (sourceType !== null && (sourceType.trim().length === 0 || /\s/.test(sourceType.trim()))) {
    removeAttr(attrs, 'type');
    state.contentRepair = true;
  }
}

function validEmbed(attrs: readonly NormAttr[]): boolean {
  const target = attributeValue(attrs, 'data-g-to');
  return target !== null && isUlid(target);
}

function ensureStructure(children: NormChild[], state: State): NormChild[] {
  const type = state.type;
  if (type === 'doc' && !treeSome(children, (element) => element.tag === 'article')) {
    state.contentRepair = true;
    return [element('article', [], children)];
  }
  if (
    type === 'slides' &&
    !treeSome(children, (element) => element.tag === 'section' && hasClass(element, 'slide'))
  ) {
    state.contentRepair = true;
    const section = treeFind(children, (element) => element.tag === 'section');
    if (section !== null) {
      addClass(section, 'slide');
      return children;
    }
    const slide = element('section', [{ name: 'class', value: 'slide' }], []);
    const article = treeFind(children, (element) => element.tag === 'article');
    if (article !== null) {
      article.children = [...article.children, slide];
      return children;
    }
    return [...children, slide];
  }
  if (
    type === 'todo' &&
    !treeSome(children, (element) => element.tag === 'ul' && hasClass(element, 'tasks'))
  ) {
    state.contentRepair = true;
    const list = element('ul', [{ name: 'class', value: 'tasks' }], []);
    const article = treeFind(children, (element) => element.tag === 'article');
    if (article !== null) {
      article.children = [...article.children, list];
      return children;
    }
    return [...children, list];
  }
  return children;
}

function repairTree(nodes: readonly NormChild[], state: State): void {
  for (const node of nodes) {
    if (node.kind === 'element') {
      repairElement(node, state);
    }
  }
}

function repairElement(node: NormElement, state: State): void {
  if (node.tag === 'ul' && hasClass(node, 'tasks')) {
    repairTaskList(node, state);
  } else {
    node.children = wrapLooseTasks(node.children, state);
  }
  for (const child of node.children) {
    if (child.kind === 'element') {
      repairElement(child, state);
    }
  }
  if (node.tag === 'li' && attributeValue(node.attrs, 'data-g-task') !== null) {
    repairCheckbox(node, state);
  }
}

function repairTaskList(list: NormElement, state: State): void {
  const next: NormChild[] = [];
  for (const child of list.children) {
    if (child.kind === 'text') {
      if (child.value.trim().length === 0) {
        next.push(child);
        continue;
      }
      state.contentRepair = true;
      next.push(taskItem(child.value));
      continue;
    }
    if (child.tag !== 'li') {
      state.contentRepair = true;
      const item = element('li', [{ name: 'data-g-task', value: '' }], [child]);
      next.push(item);
      continue;
    }
    if (attributeValue(child.attrs, 'data-g-task') === null) {
      setAttr(child.attrs, 'data-g-task', '');
      state.contentRepair = true;
    }
    next.push(child);
  }
  list.children = next;
}

function wrapLooseTasks(children: readonly NormChild[], state: State): NormChild[] {
  const next: NormChild[] = [];
  let group: NormElement[] = [];
  const flush = (): void => {
    if (group.length === 0) {
      return;
    }
    state.contentRepair = true;
    next.push(element('ul', [{ name: 'class', value: 'tasks' }], group));
    group = [];
  };
  for (const child of children) {
    if (
      child.kind === 'element' &&
      child.tag === 'li' &&
      attributeValue(child.attrs, 'data-g-task') !== null
    ) {
      group.push(child);
      continue;
    }
    flush();
    next.push(child);
  }
  flush();
  return next;
}

function repairCheckbox(item: NormElement, state: State): void {
  const inputs = collectInputs(item);
  const checked = inputs.some(
    (input) => isCheckbox(input) && attributeValue(input.attrs, 'checked') !== null,
  );
  const only = inputs.length === 1 ? inputs[0] : undefined;
  if (
    only !== undefined &&
    isCheckbox(only) &&
    onlyTypeAndChecked(only) &&
    firstElement(item) === only
  ) {
    return;
  }
  state.contentRepair = true;
  stripInputs(item);
  item.children = [checkbox(checked), ...item.children];
}

function assignIds(nodes: readonly NormChild[], state: State): void {
  const taken = new Set<string>();
  walkElements(nodes, (element) => {
    const id = attributeValue(element.attrs, 'id');
    if (id === null) {
      return;
    }
    if (id.length === 0 || /\s/.test(id) || taken.has(id)) {
      removeAttr(element.attrs, 'id');
      state.contentRepair = true;
      return;
    }
    taken.add(id);
  });
  walkElements(nodes, (element) => {
    if (element.tag === 'section' && attributeValue(element.attrs, 'id') === null) {
      const base = slugify(sectionHeading(element)) || 'seccion';
      const id = allocateSlug(base, taken);
      taken.add(id);
      setAttr(element.attrs, 'id', id);
      state.contentRepair = true;
    }
    if (
      element.tag === 'li' &&
      attributeValue(element.attrs, 'data-g-task') !== null &&
      attributeValue(element.attrs, 'id') === null
    ) {
      const base = slugify(visibleText(element)) || 'tarea';
      const id = allocateSlug(base, taken);
      taken.add(id);
      setAttr(element.attrs, 'id', id);
      state.contentRepair = true;
    }
  });
}

function serializeDocument(note: BuiltNote): string {
  const lines = [
    '<!doctype html>',
    `<html lang="${escapeAttr(note.lang)}">`,
    '  <head>',
    ...serializeHead(note),
    '  </head>',
    '  <body>',
  ];
  const body = serializeChildren(note.body, '    ');
  if (body.length > 0) {
    lines.push(body);
  }
  lines.push('  </body>', '</html>', '');
  return lines.join('\n');
}

function serializeHead(note: BuiltNote): string[] {
  const lines = ['    <meta charset="utf-8" />'];
  if (note.title !== null) {
    lines.push(`    <title>${escapeText(note.title)}</title>`);
  }
  for (const name of META_ORDER) {
    const value = note.meta.get(name);
    if (value === undefined) {
      continue;
    }
    lines.push(`    <meta name="${name}" content="${escapeAttr(value)}" />`);
  }
  lines.push(`    <link rel="stylesheet" href="${escapeAttr(note.theme)}" />`);
  return lines;
}

function serializeChildren(children: readonly NormChild[], indent: string): string {
  const lines: string[] = [];
  for (const child of children) {
    if (child.kind === 'text') {
      const text = collapse(child.value);
      if (text.length === 0) {
        continue;
      }
      lines.push(`${indent}${escapeText(text)}`);
      continue;
    }
    lines.push(serializeBlock(child, indent));
  }
  return lines.join('\n');
}

function serializeBlock(node: NormElement, indent: string): string {
  const attrs = serializeAttrs(node);
  const open = `<${node.tag}${attrs}`;
  if (node.void) {
    return `${indent}${open} />`;
  }
  if (node.tag === 'pre') {
    return `${indent}${open}>${serializeRaw(node.children)}</${node.tag}>`;
  }
  if (!hasBlockChild(node)) {
    return `${indent}${open}>${serializeInline(node.children)}</${node.tag}>`;
  }
  const inner = serializeChildren(node.children, `${indent}  `);
  if (inner.length === 0) {
    return `${indent}${open}></${node.tag}>`;
  }
  return `${indent}${open}>\n${inner}\n${indent}</${node.tag}>`;
}

function serializeInline(children: readonly NormChild[]): string {
  let raw = '';
  for (const child of children) {
    if (child.kind === 'text') {
      raw += child.value.replace(/[ \t\n\r\f]+/g, ' ');
      continue;
    }
    const attrs = serializeAttrs(child);
    if (child.void) {
      raw += `<${child.tag}${attrs} />`;
      continue;
    }
    if (child.tag === 'pre') {
      raw += `<${child.tag}${attrs}>${serializeRaw(child.children)}</${child.tag}>`;
      continue;
    }
    raw += `<${child.tag}${attrs}>${serializeInline(child.children)}</${child.tag}>`;
  }
  return raw.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
}

function serializeRaw(children: readonly NormChild[]): string {
  let raw = '';
  for (const child of children) {
    if (child.kind === 'text') {
      raw += escapeText(child.value);
      continue;
    }
    const attrs = serializeAttrs(child);
    if (child.void) {
      raw += `<${child.tag}${attrs} />`;
      continue;
    }
    raw += `<${child.tag}${attrs}>${serializeRaw(child.children)}</${child.tag}>`;
  }
  return raw;
}

function serializeAttrs(node: NormElement): string {
  const attrs = sortAttrs(node.tag, node.attrs);
  if (attrs.length === 0) {
    return '';
  }
  const parts = attrs.map((attr) => {
    if (BOOLEAN_ATTRIBUTES.has(attr.name) && attr.value === '') {
      return attr.name;
    }
    return `${attr.name}="${escapeAttr(attr.value)}"`;
  });
  return ` ${parts.join(' ')}`;
}

function warningDiagnostics(state: State): NoteDiagnostic[] {
  const diagnostics: NoteDiagnostic[] = [];
  if (state.unsafeCount > 0) {
    diagnostics.push(makeDiagnostic('W_UNSAFE_REMOVED', { count: state.unsafeCount }));
  }
  for (const remote of state.remotes) {
    diagnostics.push(makeDiagnostic('W_REMOTE_RESOURCE', remote));
  }
  if (state.styleCount > 0) {
    diagnostics.push(
      makeDiagnostic(
        'W_INLINE_STYLE_REMOVED',
        { count: state.styleCount },
        { count: state.styleCount },
      ),
    );
  }
  if (state.classCount > 0) {
    diagnostics.push(
      makeDiagnostic('W_CLASS_REMOVED', { count: state.classCount }, { count: state.classCount }),
    );
  }
  return diagnostics;
}

function makeDiagnostic(
  code: DiagnosticCode,
  details: Readonly<Record<string, string | number>> | null,
  params: Readonly<Record<string, string | number>> = {},
): NoteDiagnostic {
  const text = formatDiagnostic(code, params);
  return {
    code,
    severity: DIAGNOSTICS[code].severity,
    message: text.message,
    hint: text.hint,
    location: null,
    details,
  };
}

function noteUnsafeAttributes(element: ParseElement, tag: string, state: State): void {
  for (const attr of element.attrs) {
    const name = attr.name.toLowerCase();
    if (isEventHandlerAttribute(name)) {
      state.unsafeCount += 1;
      state.contentRepair = true;
      continue;
    }
    if (name === INLINE_STYLE_ATTRIBUTE) {
      state.styleCount += 1;
      state.contentRepair = true;
      noteCss(attr.value, tag, state);
      continue;
    }
    forEachUrl(name, attr.value, (url) => {
      if (isJavascriptUrl(url)) {
        state.unsafeCount += 1;
        state.contentRepair = true;
      }
    });
  }
}

function noteResourceAttributes(element: ParseElement, tag: string, state: State): void {
  for (const attr of element.attrs) {
    forEachUrl(attr.name.toLowerCase(), attr.value, (url) => {
      noteUrl(tag, attr.name.toLowerCase(), url, state);
    });
  }
}

function noteCss(value: string, element: string, state: State): void {
  for (const url of cssResourceUrls(value)) {
    noteUrl(element, 'style', url, state);
  }
}

function noteUrl(
  element: string,
  attributeName: string,
  url: string,
  state: State,
  keepAnchor = false,
): void {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return;
  }
  if (isJavascriptUrl(trimmed)) {
    state.unsafeCount += 1;
    state.contentRepair = true;
    return;
  }
  if (!isRemoteUrl(trimmed) || remoteUrlIsAllowed(trimmed, state.allowlist)) {
    return;
  }
  if (keepAnchor && element === 'link') {
    state.remotes.push({ element, attribute: attributeName, url: trimmed });
    state.contentRepair = true;
    return;
  }
  if (element === 'a' && attributeName === 'href') {
    return;
  }
  state.remotes.push({ element, attribute: attributeName, url: trimmed });
  state.contentRepair = true;
}

function isResourceAttribute(tag: string, name: string): boolean {
  if (tag === 'a' && name === 'href') {
    return false;
  }
  return name === 'src' || name === 'href' || name === 'poster';
}

function forEachUrl(name: string, value: string, visit: (url: string) => void): void {
  if (name === 'srcset') {
    for (const part of value.split(',')) {
      const token = part.trim().split(/\s+/)[0];
      if (token !== undefined && token.length > 0) {
        visit(token);
      }
    }
    return;
  }
  if (URL_ATTRIBUTES.has(name) || name.endsWith(':href')) {
    visit(value);
  }
}

function isForbiddenTag(tag: string, type: NoteType | null): boolean {
  if (tag === 'iframe') {
    return type !== 'artifact';
  }
  return (
    tag === 'script' || tag === 'object' || tag === 'embed' || tag === 'form' || tag === 'base'
  );
}

function namesInOrder(tag: string, names: readonly string[]): boolean {
  const sorted = [...names].sort((left, right) => compareAttr(tag, left, right));
  return names.join(',') === sorted.join(',');
}

function sortAttrs(tag: string, attrs: readonly NormAttr[]): NormAttr[] {
  return [...attrs].sort((left, right) => compareAttr(tag, left.name, right.name));
}

function compareAttr(tag: string, left: string, right: string): number {
  const leftRank = attrRank(tag, left);
  const rightRank = attrRank(tag, right);
  if (leftRank.group !== rightRank.group) {
    return leftRank.group - rightRank.group;
  }
  if (leftRank.name < rightRank.name) {
    return -1;
  }
  if (leftRank.name > rightRank.name) {
    return 1;
  }
  return 0;
}

function attrRank(tag: string, name: string): { group: number; name: string } {
  const list = ATTR_ORDER[tag] ?? DEFAULT_ATTR_ORDER;
  const index = list.indexOf(name);
  if (index !== -1) {
    return { group: index, name: '' };
  }
  if (name.startsWith('data-g-')) {
    return { group: list.length, name };
  }
  return { group: list.length + 1, name };
}

function attributeValue(attrs: readonly NormAttr[], name: string): string | null {
  for (const attr of attrs) {
    if (attr.name === name) {
      return attr.value;
    }
  }
  return null;
}

function setAttr(attrs: NormAttr[], name: string, value: string): void {
  for (const attr of attrs) {
    if (attr.name === name) {
      attr.value = value;
      return;
    }
  }
  attrs.push({ name, value });
}

function removeAttr(attrs: NormAttr[], name: string): void {
  const index = attrs.findIndex((attr) => attr.name === name);
  if (index !== -1) {
    attrs.splice(index, 1);
  }
}

function classTokens(attrs: readonly NormAttr[]): string[] {
  const raw = attributeValue(attrs, 'class');
  if (raw === null) {
    return [];
  }
  return raw.split(/\s+/).filter((token) => token.length > 0);
}

function setClassTokens(attrs: NormAttr[], tokens: readonly string[]): void {
  if (tokens.length === 0) {
    removeAttr(attrs, 'class');
    return;
  }
  setAttr(attrs, 'class', tokens.join(' '));
}

function hasClass(node: NormElement, name: string): boolean {
  return classTokens(node.attrs).includes(name);
}

function addClass(node: NormElement, name: string): void {
  const tokens = classTokens(node.attrs);
  if (tokens.includes(name)) {
    return;
  }
  tokens.push(name);
  setClassTokens(node.attrs, tokens);
}

function relTokens(value: string | null): string[] {
  if (value === null) {
    return [];
  }
  return value.split(/\s+/).filter((token) => token.length > 0);
}

function element(tag: string, attrs: NormAttr[], children: readonly NormChild[]): NormElement {
  return {
    kind: 'element',
    tag,
    attrs: sortAttrs(tag, attrs),
    children: [...children],
    void: VOID_TAGS.has(tag),
  };
}

function taskItem(text: string): NormElement {
  return element(
    'li',
    [{ name: 'data-g-task', value: '' }],
    [checkbox(false), { kind: 'text', value: text }],
  );
}

function checkbox(checked: boolean): NormElement {
  const attrs: NormAttr[] = [{ name: 'type', value: 'checkbox' }];
  if (checked) {
    attrs.push({ name: 'checked', value: '' });
  }
  return element('input', attrs, []);
}

function collectInputs(item: NormElement): NormElement[] {
  const found: NormElement[] = [];
  const stack: NormElement[] = [];
  pushElements(stack, item.children);
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (node.tag === 'li') {
      continue;
    }
    if (node.tag === 'input') {
      found.push(node);
    }
    pushElements(stack, node.children);
  }
  return found;
}

function pushElements(stack: NormElement[], children: readonly NormChild[]): void {
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child?.kind === 'element') {
      stack.push(child);
    }
  }
}

function stripInputs(item: NormElement): void {
  const next: NormChild[] = [];
  for (const child of item.children) {
    if (child.kind === 'element') {
      if (child.tag === 'input') {
        continue;
      }
      if (child.tag !== 'li') {
        stripInputs(child);
      }
    }
    next.push(child);
  }
  item.children = next;
}

function isCheckbox(input: NormElement): boolean {
  return attributeValue(input.attrs, 'type')?.toLowerCase() === 'checkbox';
}

function onlyTypeAndChecked(input: NormElement): boolean {
  return input.attrs.every((attr) => attr.name === 'type' || attr.name === 'checked');
}

function firstElement(item: NormElement): NormElement | null {
  for (const child of item.children) {
    if (child.kind === 'element') {
      return child;
    }
  }
  return null;
}

function walkElements(nodes: readonly NormChild[], visit: (element: NormElement) => void): void {
  for (const node of nodes) {
    if (node.kind !== 'element') {
      continue;
    }
    visit(node);
    walkElements(node.children, visit);
  }
}

function sectionHeading(section: NormElement): string {
  const stack: NormElement[] = [];
  pushElements(stack, section.children);
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || node.tag === 'section') {
      continue;
    }
    if (/^h[1-6]$/.test(node.tag)) {
      return visibleText(node);
    }
    pushElements(stack, node.children);
  }
  return '';
}

function visibleText(node: NormElement): string {
  let raw = '';
  const stack: NormChild[] = [];
  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const child = node.children[index];
    if (child !== undefined) {
      stack.push(child);
    }
  }
  while (stack.length > 0) {
    const child = stack.pop();
    if (child === undefined) {
      continue;
    }
    if (child.kind === 'text') {
      raw += child.value;
      continue;
    }
    if (child.tag === 'input') {
      continue;
    }
    for (let index = child.children.length - 1; index >= 0; index -= 1) {
      const nested = child.children[index];
      if (nested !== undefined) {
        stack.push(nested);
      }
    }
  }
  return collapse(raw);
}

function treeSome(
  nodes: readonly NormChild[],
  predicate: (element: NormElement) => boolean,
): boolean {
  for (const node of nodes) {
    if (node.kind !== 'element') {
      continue;
    }
    if (predicate(node) || treeSome(node.children, predicate)) {
      return true;
    }
  }
  return false;
}

function treeFind(
  nodes: readonly NormChild[],
  predicate: (element: NormElement) => boolean,
): NormElement | null {
  for (const node of nodes) {
    if (node.kind !== 'element') {
      continue;
    }
    if (predicate(node)) {
      return node;
    }
    const found = treeFind(node.children, predicate);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function hasBlockChild(node: NormElement): boolean {
  return node.children.some((child) => child.kind === 'element' && BLOCK_TAGS.has(child.tag));
}

function collapse(value: string): string {
  return value.replace(/[ \t\n\r\f]+/g, ' ').trim();
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function attribute(element: ParseElement, name: string): string | null {
  const target = name.toLowerCase();
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === target) {
      return attr.value;
    }
  }
  return null;
}

function elementText(element: ParseElement): string {
  let text = '';
  const stack: ParseChild[] = [];
  for (let index = element.childNodes.length - 1; index >= 0; index -= 1) {
    const child = element.childNodes[index];
    if (child !== undefined) {
      stack.push(child);
    }
  }
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (isTextNode(node)) {
      text += node.value;
      continue;
    }
    if (!isElementNode(node) || node.tagName.toLowerCase() === 'script') {
      continue;
    }
    const children = childNodesOf(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return text;
}

function childNodesOf(element: ParseElement): readonly ParseChild[] {
  if (isTemplateElement(element)) {
    return element.content.childNodes;
  }
  return element.childNodes;
}

function findChild(document: ParseDocument, tag: string): ParseElement | null {
  for (const child of document.childNodes) {
    if (isElementNode(child) && child.tagName.toLowerCase() === tag) {
      return child;
    }
  }
  return null;
}

function findChildElement(element: ParseElement, tag: string): ParseElement | null {
  for (const child of element.childNodes) {
    if (isElementNode(child) && child.tagName.toLowerCase() === tag) {
      return child;
    }
  }
  return null;
}

function isTextNode(node: ParseChild): node is ParseText {
  return node.nodeName === '#text';
}

function isElementNode(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}

function isTemplateElement(element: ParseElement): element is ParseTemplate {
  return element.tagName === 'template' && 'content' in element;
}
