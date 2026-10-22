/**
 * Reads a full HTML note with parse5 into a typed model.
 * Parsing never executes scripts, fetches URLs, or rewrites the tree.
 * Allow-lists, type structure, and canonical serialization are later tasks.
 */
import { html, parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  BODY_ELEMENTS,
  DOCUMENT_SHELL,
  FORBIDDEN_ELEMENTS,
  isEventHandlerAttribute,
  isIso8601,
  isJavascriptUrl,
  isNoteType,
  isRemoteUrl,
  isUlid,
  type NoteType,
} from './contract.ts';
import { DIAGNOSTICS, formatDiagnostic, type DiagnosticCode } from './errors.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseTemplate = DefaultTreeAdapterMap['template'];
type ParseText = DefaultTreeAdapterMap['textNode'];

/** Maximum HTML size, in UTF-16 code units, that parseNote will read. */
export const MAX_NOTE_HTML_CHARS = 2_000_000;

/** Element nesting deeper than this is an error. The security walk stays iterative. */
export const MAX_NOTE_DEPTH = 100;

const BODY_CHILD_DEPTH = 3;

const [ID_META, TYPE_META, CREATED_META] = DOCUMENT_SHELL.requiredMeta;
const [TAGS_META, ALIASES_META, UPDATED_META] = DOCUMENT_SHELL.optionalMeta;

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'address',
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

export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

export interface NoteDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly hint: string;
  readonly location: SourceLocation | null;
  readonly details: Readonly<Record<string, string | number>> | null;
}

export interface NoteMetadata {
  readonly title: string | null;
  readonly id: string | null;
  readonly type: NoteType | null;
  readonly rawType: string | null;
  readonly created: string | null;
  readonly updated: string | null;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
}

export interface NoteHeading {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
  readonly warning: boolean;
  readonly sectionId: string | null;
  readonly location: SourceLocation | null;
}

export interface NoteSection {
  readonly id: string | null;
  readonly classes: readonly string[];
  readonly heading: NoteHeading | null;
  readonly plainText: string;
  readonly children: readonly NoteSection[];
  readonly location: SourceLocation | null;
}

export interface WikilinkParts {
  readonly raw: string;
  readonly title: string;
  readonly section: string | null;
  readonly label: string | null;
}

export type NoteLinkKind = 'canonical' | 'pending' | 'wikilink' | 'external' | 'relative';

export interface NoteLink {
  readonly kind: NoteLinkKind;
  readonly text: string;
  readonly href: string | null;
  readonly targetId: string | null;
  readonly pendingTitle: string | null;
  readonly rel: string | null;
  readonly sectionId: string | null;
  readonly ghost: boolean;
  readonly wikilink: WikilinkParts | null;
  readonly location: SourceLocation | null;
}

export interface NoteTask {
  readonly id: string | null;
  readonly text: string;
  readonly checked: boolean;
  readonly due: string | null;
  readonly priority: string | null;
  readonly sectionId: string | null;
  readonly location: SourceLocation | null;
}

export interface NoteModel {
  readonly metadata: NoteMetadata;
  readonly title: string | null;
  readonly id: string | null;
  readonly type: NoteType | null;
  readonly headings: readonly NoteHeading[];
  readonly sections: readonly NoteSection[];
  readonly links: readonly NoteLink[];
  readonly tasks: readonly NoteTask[];
  readonly plainText: string;
  readonly diagnostics: readonly NoteDiagnostic[];
}

export interface ParseResult {
  readonly ok: boolean;
  readonly note: NoteModel | null;
  readonly diagnostics: readonly NoteDiagnostic[];
}

interface FieldSlot {
  value: string | null;
  location: SourceLocation | null;
}

interface DuplicateMeta {
  readonly field: string;
  readonly location: SourceLocation | null;
}

interface MetaFields {
  title: FieldSlot;
  id: FieldSlot;
  rawType: FieldSlot;
  created: FieldSlot;
  updated: FieldSlot;
  tags: FieldSlot;
  aliases: FieldSlot;
  duplicates: DuplicateMeta[];
}

interface WalkState {
  readonly depth: number;
  readonly sectionId: string | null;
  readonly inCode: boolean;
}

interface Walked {
  sections: NoteSection[];
  links: NoteLink[];
  tasks: NoteTask[];
  headings: NoteHeading[];
  allHeadings: NoteHeading[];
}

interface BuiltSection {
  readonly section: NoteSection;
  readonly links: NoteLink[];
  readonly tasks: NoteTask[];
  readonly allHeadings: NoteHeading[];
}

interface ScanFrame {
  readonly node: ParseElement;
  readonly depth: number;
  readonly collectMeta: boolean;
}

export function parseNote(input: unknown): ParseResult {
  if (typeof input !== 'string') {
    return reject({ reason: 'input' });
  }
  // A leading BOM is not a missing doctype; parse5 reports one if it is left in place.
  const html = input.startsWith('\uFEFF') ? input.slice(1) : input;
  if (html.length > MAX_NOTE_HTML_CHARS) {
    return reject({ reason: 'size', length: html.length });
  }

  let markupCount = 0;
  let markupLocation: SourceLocation | null = null;
  let document: ParseDocument;
  try {
    document = parse(html, {
      // Default true would leave <noscript> contents as text and hide a nested script.
      scriptingEnabled: false,
      sourceCodeLocationInfo: true,
      onParseError: (error) => {
        markupCount += 1;
        markupLocation ??= { line: error.startLine, column: error.startCol };
      },
    });
  } catch {
    return reject({ reason: 'markup' });
  }

  const diagnostics: NoteDiagnostic[] = [];
  if (markupCount > 0) {
    diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', markupLocation, { reason: 'markup', count: markupCount }),
    );
  }

  const scanned = scanTree(document);
  if (scanned.maxDepth > MAX_NOTE_DEPTH) {
    diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', null, { reason: 'depth', depth: scanned.maxDepth }),
    );
  }
  const metadata = appendMetadataDiagnostics(scanned.meta, diagnostics);
  for (const diagnostic of scanned.unsafe) {
    diagnostics.push(diagnostic);
  }

  const body = findBody(document);
  const walked =
    body === null
      ? emptyWalked()
      : walkElements(
          body.childNodes,
          { depth: BODY_CHILD_DEPTH, sectionId: null, inCode: false },
          diagnostics,
        );
  const plainText = body === null ? '' : renderPlain(body.childNodes, false, BODY_CHILD_DEPTH);
  const note: NoteModel = {
    metadata,
    title: metadata.title,
    id: metadata.id,
    type: metadata.type,
    headings: walked.allHeadings,
    sections: walked.sections,
    links: walked.links,
    tasks: walked.tasks,
    plainText,
    diagnostics,
  };
  return { ok: !hasError(diagnostics), note, diagnostics };
}

function reject(details: Readonly<Record<string, string | number>>): ParseResult {
  return {
    ok: false,
    note: null,
    diagnostics: [makeDiagnostic('E_HTML_INVALID', null, details)],
  };
}

function makeDiagnostic(
  code: DiagnosticCode,
  location: SourceLocation | null,
  details: Readonly<Record<string, string | number>> | null,
): NoteDiagnostic {
  const text = formatDiagnostic(code);
  return {
    code,
    severity: DIAGNOSTICS[code].severity,
    message: text.message,
    hint: text.hint,
    location,
    details,
  };
}

function hasError(diagnostics: readonly NoteDiagnostic[]): boolean {
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error') {
      return true;
    }
  }
  return false;
}

function scanTree(document: ParseDocument): {
  meta: MetaFields;
  unsafe: NoteDiagnostic[];
  maxDepth: number;
} {
  const meta = emptyMeta();
  const unsafe: NoteDiagnostic[] = [];
  let maxDepth = 0;
  const stack: ScanFrame[] = [];
  pushElements(stack, document.childNodes, 1, true);
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) {
      continue;
    }
    if (frame.depth > maxDepth) {
      maxDepth = frame.depth;
    }
    inspectElement(frame.node, frame.collectMeta, meta, unsafe);
    const children = isTemplateElement(frame.node)
      ? frame.node.content.childNodes
      : frame.node.childNodes;
    pushElements(
      stack,
      children,
      frame.depth + 1,
      frame.collectMeta && !isTemplateElement(frame.node),
    );
  }
  return { meta, unsafe, maxDepth };
}

function pushElements(
  stack: ScanFrame[],
  nodes: readonly ParseChild[],
  depth: number,
  collectMeta: boolean,
): void {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node !== undefined && isElementNode(node)) {
      stack.push({ node, depth, collectMeta });
    }
  }
}

function inspectElement(
  element: ParseElement,
  collectMeta: boolean,
  meta: MetaFields,
  unsafe: NoteDiagnostic[],
): void {
  const tag = element.tagName.toLowerCase();
  const location = elementLocation(element);
  const forbidden = forbiddenDiagnostic(tag);
  if (forbidden !== null) {
    unsafe.push(makeDiagnostic(forbidden, location, { element: tag }));
  }
  for (const attr of element.attrs) {
    const attributeName = attr.name.toLowerCase();
    if (isEventHandlerAttribute(attr.name)) {
      unsafe.push(
        makeDiagnostic('E_UNSAFE_HANDLER', location, { element: tag, attribute: attributeName }),
      );
      continue;
    }
    if (attributeHasJavascriptUrl(attributeName, attr.value)) {
      unsafe.push(
        makeDiagnostic('E_UNSAFE_URL', location, { element: tag, attribute: attributeName }),
      );
    }
  }
  if (tag === 'meta' && refreshHasJavascriptUrl(element)) {
    unsafe.push(
      makeDiagnostic('E_UNSAFE_URL', location, { element: 'meta', attribute: 'content' }),
    );
  }
  if (!collectMeta || element.namespaceURI !== html.NS.HTML) {
    return;
  }
  if (tag === 'title') {
    takeField(
      meta.title,
      collapseWhitespace(rawText(element.childNodes, 0)),
      location,
      'title',
      meta.duplicates,
    );
    return;
  }
  if (tag === 'meta') {
    readMetaElement(element, location, meta);
  }
}

function readMetaElement(
  element: ParseElement,
  location: SourceLocation | null,
  meta: MetaFields,
): void {
  const name = attribute(element, 'name');
  if (name === null) {
    return;
  }
  const key = name.trim().toLowerCase();
  const content = attribute(element, 'content');
  const value = content === null ? '' : content.trim();
  if (key === ID_META) {
    takeField(meta.id, value, location, ID_META, meta.duplicates);
    return;
  }
  if (key === TYPE_META) {
    takeField(meta.rawType, value, location, TYPE_META, meta.duplicates);
    return;
  }
  if (key === CREATED_META) {
    takeField(meta.created, value, location, CREATED_META, meta.duplicates);
    return;
  }
  if (key === UPDATED_META) {
    takeField(meta.updated, value, location, UPDATED_META, meta.duplicates);
    return;
  }
  if (key === TAGS_META) {
    takeField(meta.tags, value, location, TAGS_META, meta.duplicates);
    return;
  }
  if (key === ALIASES_META) {
    takeField(meta.aliases, value, location, ALIASES_META, meta.duplicates);
  }
}

function takeField(
  slot: FieldSlot,
  value: string,
  location: SourceLocation | null,
  field: string,
  duplicates: DuplicateMeta[],
): void {
  if (value.length === 0) {
    return;
  }
  if (slot.value === null) {
    slot.value = value;
    slot.location = location;
    return;
  }
  if (slot.value !== value) {
    duplicates.push({ field, location });
  }
}

function appendMetadataDiagnostics(meta: MetaFields, diagnostics: NoteDiagnostic[]): NoteMetadata {
  if (meta.title.value === null) {
    diagnostics.push(makeDiagnostic('E_META_MISSING', meta.title.location, { field: 'title' }));
  }
  if (meta.id.value === null) {
    diagnostics.push(makeDiagnostic('E_META_MISSING', meta.id.location, { field: ID_META }));
  } else if (!isUlid(meta.id.value)) {
    diagnostics.push(makeDiagnostic('E_HTML_INVALID', meta.id.location, { reason: 'id' }));
  }

  let type: NoteType | null = null;
  if (meta.rawType.value === null) {
    diagnostics.push(makeDiagnostic('E_META_MISSING', meta.rawType.location, { field: TYPE_META }));
  } else if (!isNoteType(meta.rawType.value)) {
    diagnostics.push(makeDiagnostic('E_HTML_INVALID', meta.rawType.location, { reason: 'type' }));
  } else {
    type = meta.rawType.value;
  }

  if (meta.created.value === null) {
    diagnostics.push(
      makeDiagnostic('E_META_MISSING', meta.created.location, { field: CREATED_META }),
    );
  } else if (!isIso8601(meta.created.value)) {
    diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', meta.created.location, { reason: 'created' }),
    );
  }
  if (meta.updated.value !== null && !isIso8601(meta.updated.value)) {
    diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', meta.updated.location, { reason: 'updated' }),
    );
  }
  for (const duplicate of meta.duplicates) {
    diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', duplicate.location, {
        reason: 'duplicate',
        field: duplicate.field,
      }),
    );
  }

  return {
    title: meta.title.value,
    id: meta.id.value,
    type,
    rawType: meta.rawType.value,
    created: meta.created.value,
    updated: meta.updated.value,
    tags: splitList(meta.tags.value),
    aliases: splitList(meta.aliases.value),
  };
}

function walkElements(
  nodes: readonly ParseChild[],
  state: WalkState,
  diagnostics: NoteDiagnostic[],
): Walked {
  if (state.depth > MAX_NOTE_DEPTH) {
    return emptyWalked();
  }
  const walked = emptyWalked();
  for (const node of nodes) {
    if (isTextNode(node)) {
      if (!state.inCode) {
        for (const link of readWikilinks(node, state)) {
          walked.links.push(link);
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
    if (tag === 'section') {
      const built = buildSection(node, state, diagnostics);
      walked.sections.push(built.section);
      pushAll(walked.links, built.links);
      pushAll(walked.tasks, built.tasks);
      pushAll(walked.allHeadings, built.allHeadings);
      continue;
    }
    const level = headingLevel(tag);
    if (level !== null) {
      const heading = readHeading(node, tag, level, state.sectionId);
      walked.headings.push(heading);
      walked.allHeadings.push(heading);
    }
    if (tag === 'a') {
      walked.links.push(readAnchor(node, state, diagnostics));
    } else if (tag === 'li' && hasAttribute(node, 'data-g-task')) {
      walked.tasks.push(readTask(node, state));
    }
    const child = walkElements(
      node.childNodes,
      {
        depth: state.depth + 1,
        sectionId: state.sectionId,
        inCode: state.inCode || tag === 'pre' || tag === 'code',
      },
      diagnostics,
    );
    pushAll(walked.sections, child.sections);
    pushAll(walked.links, child.links);
    pushAll(walked.tasks, child.tasks);
    pushAll(walked.headings, child.headings);
    pushAll(walked.allHeadings, child.allHeadings);
  }
  return walked;
}

function buildSection(
  element: ParseElement,
  state: WalkState,
  diagnostics: NoteDiagnostic[],
): BuiltSection {
  const id = trimmedOrNull(attribute(element, 'id'));
  const walked = walkElements(
    element.childNodes,
    {
      depth: state.depth + 1,
      sectionId: id ?? state.sectionId,
      inCode: state.inCode,
    },
    diagnostics,
  );
  return {
    section: {
      id,
      classes: classList(element),
      heading: walked.headings[0] ?? null,
      plainText: renderPlain(element.childNodes, true, state.depth + 1),
      children: walked.sections,
      location: elementLocation(element),
    },
    links: walked.links,
    tasks: walked.tasks,
    allHeadings: walked.allHeadings,
  };
}

function readHeading(
  element: ParseElement,
  tag: string,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  sectionId: string | null,
): NoteHeading {
  return {
    level,
    text: textContent(element),
    warning: headingWarns(tag),
    sectionId,
    location: elementLocation(element),
  };
}

function readAnchor(
  element: ParseElement,
  state: WalkState,
  diagnostics: NoteDiagnostic[],
): NoteLink {
  const href = trimmedOrNull(attribute(element, 'href'));
  const targetId = trimmedOrNull(attribute(element, 'data-g-to'));
  const pendingTitle = trimmedOrNull(attribute(element, 'data-g-pending'));
  const location = elementLocation(element);
  let kind: NoteLinkKind = 'relative';
  let ghost = false;
  if (targetId !== null) {
    kind = 'canonical';
    if (!isUlid(targetId)) {
      diagnostics.push(makeDiagnostic('E_HTML_INVALID', location, { reason: 'target-id' }));
    }
  } else if (pendingTitle !== null) {
    kind = 'pending';
    ghost = true;
  } else if (href !== null && isExternalHref(href)) {
    kind = 'external';
  }
  return {
    kind,
    text: textContent(element),
    href,
    targetId,
    pendingTitle,
    rel: trimmedOrNull(attribute(element, 'rel')),
    sectionId: state.sectionId,
    ghost,
    wikilink: null,
    location,
  };
}

function readWikilinks(node: ParseText, state: WalkState): NoteLink[] {
  const links: NoteLink[] = [];
  const start = nodeLocation(node);
  const value = node.value;
  let cursor = 0;
  while (cursor < value.length) {
    const open = value.indexOf('[[', cursor);
    if (open === -1) {
      break;
    }
    const close = value.indexOf(']]', open + 2);
    if (close === -1) {
      break;
    }
    const parsed = parseWikilinkBody(value.slice(open + 2, close));
    cursor = close + 2;
    if (parsed === null) {
      continue;
    }
    links.push({
      kind: 'wikilink',
      text: parsed.label ?? parsed.title,
      href: null,
      targetId: null,
      pendingTitle: parsed.title,
      rel: null,
      sectionId: state.sectionId,
      ghost: false,
      wikilink: {
        raw: value.slice(open, close + 2),
        title: parsed.title,
        section: parsed.section,
        label: parsed.label,
      },
      location: start === null ? null : advance(start, value, open),
    });
  }
  return links;
}

function parseWikilinkBody(
  body: string,
): { title: string; section: string | null; label: string | null } | null {
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

function readTask(element: ParseElement, state: WalkState): NoteTask {
  return {
    id: trimmedOrNull(attribute(element, 'id')),
    text: textContent(element),
    checked: checkboxChecked(element),
    due: trimmedOrNull(attribute(element, 'data-g-due')),
    priority: trimmedOrNull(attribute(element, 'data-g-priority')),
    sectionId: state.sectionId,
    location: elementLocation(element),
  };
}

function renderPlain(
  nodes: readonly ParseChild[],
  skipNestedSections: boolean,
  depth: number,
): string {
  if (depth > MAX_NOTE_DEPTH) {
    return '';
  }
  const lines: string[] = [];
  let inline = '';
  const flush = (): void => {
    const collapsed = collapseWhitespace(inline);
    inline = '';
    if (collapsed.length > 0) {
      lines.push(collapsed);
    }
  };
  for (const node of nodes) {
    if (isTextNode(node)) {
      inline += node.value;
      continue;
    }
    if (!isElementNode(node)) {
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'template') {
      continue;
    }
    if (skipNestedSections && tag === 'section') {
      continue;
    }
    if (tag === 'br') {
      flush();
      continue;
    }
    if (tag === 'pre') {
      flush();
      const text = rawPre(node.childNodes, depth + 1).replace(/^\n+|\n+$/g, '');
      if (text.length > 0) {
        lines.push(text);
      }
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      const inner = renderPlain(node.childNodes, skipNestedSections, depth + 1);
      if (inner.length > 0) {
        lines.push(inner);
      }
      continue;
    }
    inline += renderPlain(node.childNodes, skipNestedSections, depth + 1);
  }
  flush();
  return lines.join('\n');
}

function rawPre(nodes: readonly ParseChild[], depth: number): string {
  if (depth > MAX_NOTE_DEPTH) {
    return '';
  }
  let out = '';
  for (const node of nodes) {
    if (isTextNode(node)) {
      out += node.value;
      continue;
    }
    if (!isElementNode(node)) {
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') {
      continue;
    }
    out += rawPre(node.childNodes, depth + 1);
  }
  return out;
}

function rawText(nodes: readonly ParseChild[], depth: number): string {
  if (depth > MAX_NOTE_DEPTH) {
    return '';
  }
  let out = '';
  for (const node of nodes) {
    if (isTextNode(node)) {
      out += node.value;
      continue;
    }
    if (!isElementNode(node)) {
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'template') {
      continue;
    }
    out += rawText(node.childNodes, depth + 1);
  }
  return out;
}

function textContent(element: ParseElement): string {
  return collapseWhitespace(rawText(element.childNodes, 0));
}

function checkboxChecked(element: ParseElement): boolean {
  for (const child of element.childNodes) {
    if (!isElementNode(child) || child.tagName.toLowerCase() !== 'input') {
      continue;
    }
    const type = attribute(child, 'type');
    if (
      type !== null &&
      type.trim().toLowerCase() === 'checkbox' &&
      hasAttribute(child, 'checked')
    ) {
      return true;
    }
  }
  return false;
}

function forbiddenDiagnostic(tag: string): DiagnosticCode | null {
  switch (tag) {
    case 'script':
      return FORBIDDEN_ELEMENTS.script;
    case 'iframe':
      return FORBIDDEN_ELEMENTS.iframe;
    case 'object':
      return FORBIDDEN_ELEMENTS.object;
    case 'embed':
      return FORBIDDEN_ELEMENTS.embed;
    case 'form':
      return FORBIDDEN_ELEMENTS.form;
    case 'base':
      return FORBIDDEN_ELEMENTS.base;
    default:
      return null;
  }
}

function attributeHasJavascriptUrl(name: string, value: string): boolean {
  if (!URL_ATTRIBUTES.has(name) && !name.endsWith(':href')) {
    return false;
  }
  if (name === 'srcset') {
    for (const part of value.split(',')) {
      const token = part.trim().split(/\s+/)[0];
      if (token !== undefined && token.length > 0 && isJavascriptUrl(token)) {
        return true;
      }
    }
    return false;
  }
  return isJavascriptUrl(value);
}

function refreshHasJavascriptUrl(element: ParseElement): boolean {
  const equiv = attribute(element, 'http-equiv');
  if (equiv?.trim().toLowerCase() !== 'refresh') {
    return false;
  }
  const content = attribute(element, 'content');
  if (content === null) {
    return false;
  }
  const url = /url\s*=\s*([^;\s]+)/i.exec(content)?.[1];
  if (url === undefined) {
    return false;
  }
  return isJavascriptUrl(url);
}

function isExternalHref(href: string): boolean {
  if (isRemoteUrl(href)) {
    return true;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

function headingLevel(tag: string): 1 | 2 | 3 | 4 | 5 | 6 | null {
  switch (tag) {
    case 'h1':
      return 1;
    case 'h2':
      return 2;
    case 'h3':
      return 3;
    case 'h4':
      return 4;
    case 'h5':
      return 5;
    case 'h6':
      return 6;
    default:
      return null;
  }
}

function headingWarns(tag: string): boolean {
  for (const element of BODY_ELEMENTS) {
    if (element.name === tag) {
      return element.headingWarning;
    }
  }
  return false;
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

function attribute(element: ParseElement, name: string): string | null {
  const target = name.toLowerCase();
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === target) {
      return attr.value;
    }
  }
  return null;
}

function hasAttribute(element: ParseElement, name: string): boolean {
  return attribute(element, name) !== null;
}

function classList(element: ParseElement): string[] {
  const raw = attribute(element, 'class');
  if (raw === null) {
    return [];
  }
  const classes: string[] = [];
  for (const part of raw.split(/\s+/)) {
    if (part.length > 0) {
      classes.push(part);
    }
  }
  return classes;
}

function splitList(value: string | null): string[] {
  if (value === null) {
    return [];
  }
  const parts: string[] = [];
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      parts.push(trimmed);
    }
  }
  return parts;
}

function trimmedOrNull(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function blankToNull(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function elementLocation(element: ParseElement): SourceLocation | null {
  const location = element.sourceCodeLocation;
  if (location === undefined || location === null) {
    return null;
  }
  return { line: location.startLine, column: location.startCol };
}

function nodeLocation(node: ParseText): SourceLocation | null {
  const location = node.sourceCodeLocation;
  if (location === undefined || location === null) {
    return null;
  }
  return { line: location.startLine, column: location.startCol };
}

function advance(start: SourceLocation, value: string, index: number): SourceLocation {
  let line = start.line;
  let column = start.column;
  const end = Math.min(index, value.length);
  for (let offset = 0; offset < end; offset += 1) {
    if (value[offset] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
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

function emptyMeta(): MetaFields {
  return {
    title: { value: null, location: null },
    id: { value: null, location: null },
    rawType: { value: null, location: null },
    created: { value: null, location: null },
    updated: { value: null, location: null },
    tags: { value: null, location: null },
    aliases: { value: null, location: null },
    duplicates: [],
  };
}

function emptyWalked(): Walked {
  return { sections: [], links: [], tasks: [], headings: [], allHeadings: [] };
}

function pushAll<T>(target: T[], source: readonly T[]): void {
  for (const item of source) {
    target.push(item);
  }
}
