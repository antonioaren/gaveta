/**
 * Validates a note against the authoring contract.
 * `parseNote` supplies the model plus metadata and unsafe-content diagnostics.
 * This module walks the tree again for allow-lists, type structure, and resources.
 * The walk is iterative: a recursive walk overflows on the depth fixture.
 * h4–h6 stay a `heading.warning` on the model; the catalog has no code for them.
 */
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  DOCUMENT_SHELL,
  FORBIDDEN_ELEMENTS,
  INLINE_STYLE_ATTRIBUTE,
  NOTE_TYPE_STRUCTURES,
  SUGGESTED_REL,
  isAllowedAttribute,
  isAllowedBodyElement,
  isAllowedClass,
  isCalloutKind,
  isEventHandlerAttribute,
  isIso8601,
  isJavascriptUrl,
  isRemoteUrl,
  isTaskPriority,
  isUlid,
  type NoteType,
} from './contract.ts';
import { DIAGNOSTICS, formatDiagnostic, type DiagnosticCode } from './errors.ts';
import {
  MAX_NOTE_DEPTH,
  parseNote,
  type NoteDiagnostic,
  type NoteModel,
  type SourceLocation,
} from './parser.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseTemplate = DefaultTreeAdapterMap['template'];
type ParseText = DefaultTreeAdapterMap['textNode'];

export interface ValidateNoteOptions {
  readonly strictRel?: boolean;
  /** When omitted, the suggested vocabulary is used. An empty list warns on every relationship token. */
  readonly relVocabulary?: readonly string[];
  readonly remoteAllowlist?: readonly string[];
  /** Vault-relative note path. Relative `..` is judged only when this path is safe. */
  readonly notePath?: string;
}

export type ValidateVaultOptions = Omit<ValidateNoteOptions, 'notePath'>;

export interface ValidationResult {
  readonly ok: boolean;
  readonly note: NoteModel | null;
  readonly diagnostics: readonly NoteDiagnostic[];
}

export interface VaultNoteSource {
  readonly path: string;
  readonly html: string;
}

export interface VaultFileValidation {
  readonly path: string;
  readonly result: ValidationResult;
}

export interface VaultValidation {
  readonly ok: boolean;
  readonly files: readonly VaultFileValidation[];
}

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

const SAFE_REL: ReadonlySet<string> = new Set(['noopener', 'noreferrer', 'nofollow']);

const META_NAMES: ReadonlySet<string> = new Set(
  [...DOCUMENT_SHELL.requiredMeta, ...DOCUMENT_SHELL.optionalMeta].map((name) =>
    name.toLowerCase(),
  ),
);

interface Report {
  diagnostics: NoteDiagnostic[];
  readonly type: NoteType | null;
  readonly basePath: string | null;
  readonly vocabulary: ReadonlySet<string>;
  readonly allowlist: ReadonlySet<string>;
  readonly strictRel: boolean;
  styleCount: number;
  styleLocation: SourceLocation | null;
  articleCount: number;
  slideCount: number;
  taskListCount: number;
  readonly ids: Set<string>;
}

interface Frame {
  readonly node: ParseElement;
  readonly depth: number;
  readonly parentTag: string | null;
  readonly parentClasses: readonly string[];
  readonly inTask: boolean;
}

export function validateNote(input: unknown, options: ValidateNoteOptions = {}): ValidationResult {
  const parsed = parseNote(input);
  const diagnostics = [...parsed.diagnostics];
  const basePath = noteBase(options.notePath, diagnostics);
  if (parsed.note === null || typeof input !== 'string') {
    return finish(parsed.note, diagnostics);
  }

  if (!hasDoctype(input)) {
    diagnostics.push(makeDiagnostic('E_HTML_INVALID', null, { reason: 'doctype' }));
  }

  const report: Report = {
    diagnostics,
    type: parsed.note.type,
    basePath,
    vocabulary: new Set(options.relVocabulary ?? SUGGESTED_REL),
    allowlist: allowlistHosts(options.remoteAllowlist ?? []),
    strictRel: options.strictRel === true,
    styleCount: 0,
    styleLocation: null,
    articleCount: 0,
    slideCount: 0,
    taskListCount: 0,
    ids: new Set(),
  };

  let tree: ParseDocument;
  try {
    tree = parse(stripBom(input), { scriptingEnabled: false, sourceCodeLocationInfo: true });
  } catch {
    diagnostics.push(makeDiagnostic('E_HTML_INVALID', null, { reason: 'markup' }));
    return finish(parsed.note, diagnostics);
  }

  walk(tree, report);
  if (report.styleCount > 0) {
    diagnostics.push(
      makeDiagnostic(
        'W_INLINE_STYLE_REMOVED',
        report.styleLocation,
        { count: report.styleCount },
        { count: report.styleCount },
      ),
    );
  }
  appendStructure(report);
  return finish(parsed.note, diagnostics);
}

export function validateVault(
  notes: readonly VaultNoteSource[],
  options: ValidateVaultOptions = {},
): VaultValidation {
  const ordered = [...notes].sort((left, right) => {
    if (left.path < right.path) {
      return -1;
    }
    if (left.path > right.path) {
      return 1;
    }
    return 0;
  });
  const files: VaultFileValidation[] = ordered.map((note) => ({
    path: note.path,
    result: validateNote(note.html, { ...options, notePath: note.path }),
  }));
  const byId = new Map<string, string[]>();
  for (const file of files) {
    const id = file.result.note?.id;
    if (id === null || id === undefined || id.length === 0) {
      continue;
    }
    const paths = byId.get(id);
    if (paths === undefined) {
      byId.set(id, [file.path]);
    } else {
      paths.push(file.path);
    }
  }
  const checked = files.map((file) => withDuplicate(file, byId));
  return { ok: checked.every((file) => file.result.ok), files: checked };
}

function withDuplicate(
  file: VaultFileValidation,
  byId: ReadonlyMap<string, string[]>,
): VaultFileValidation {
  const id = file.result.note?.id;
  if (id === null || id === undefined || id.length === 0) {
    return file;
  }
  const paths = byId.get(id);
  if (paths === undefined || paths.length < 2) {
    return file;
  }
  const other = paths.filter((path) => path !== file.path).join(',');
  const diagnostics = [
    ...file.result.diagnostics,
    makeDiagnostic('E_ID_DUPLICATE', null, { id, path: file.path, other }),
  ];
  return { path: file.path, result: finish(file.result.note, diagnostics) };
}

function finish(note: NoteModel | null, diagnostics: NoteDiagnostic[]): ValidationResult {
  const ok = !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return {
    ok,
    diagnostics,
    note: note === null ? null : { ...note, diagnostics },
  };
}

function noteBase(notePath: string | undefined, diagnostics: NoteDiagnostic[]): string | null {
  if (notePath === undefined) {
    return null;
  }
  if (!isSafeNotePath(notePath)) {
    diagnostics.push(makeDiagnostic('E_ARG_INVALID', null, { field: 'notePath' }));
    return null;
  }
  return notePath;
}

function hasDoctype(input: string): boolean {
  return stripBom(input).trimStart().toLowerCase().startsWith('<!doctype html');
}

function stripBom(input: string): string {
  return input.startsWith('\uFEFF') ? input.slice(1) : input;
}

function makeDiagnostic(
  code: DiagnosticCode,
  location: SourceLocation | null,
  details: Record<string, string | number> | null,
  params: Readonly<Record<string, string | number>> = {},
  severity?: 'error' | 'warning',
): NoteDiagnostic {
  const text = formatDiagnostic(code, params);
  return {
    code,
    severity: severity ?? DIAGNOSTICS[code].severity,
    message: text.message,
    hint: text.hint,
    location,
    details,
  };
}

function walk(document: ParseDocument, report: Report): void {
  const stack: Frame[] = [];
  pushElements(stack, document.childNodes, 1, null, [], false);
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined || frame.depth > MAX_NOTE_DEPTH) {
      continue;
    }
    const tag = frame.node.tagName.toLowerCase();
    const classes = classList(frame.node);
    visit(frame, tag, classes, report);
    if (tag === 'script' || tag === 'style' || frame.depth >= MAX_NOTE_DEPTH) {
      continue;
    }
    const inTask = frame.inTask || (tag === 'li' && hasAttribute(frame.node, 'data-g-task'));
    pushElements(stack, childNodes(frame.node), frame.depth + 1, tag, classes, inTask);
  }
}

function pushElements(
  stack: Frame[],
  nodes: readonly ParseChild[],
  depth: number,
  parentTag: string | null,
  parentClasses: readonly string[],
  inTask: boolean,
): void {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node !== undefined && isElementNode(node)) {
      stack.push({ node, depth, parentTag, parentClasses, inTask });
    }
  }
}

function visit(frame: Frame, tag: string, classes: readonly string[], report: Report): void {
  const element = frame.node;
  const location = elementLocation(element);
  const id = readId(element, location, report);
  scanUrlsAndStyle(element, tag, location, report);

  if (Object.hasOwn(FORBIDDEN_ELEMENTS, tag)) {
    return;
  }
  if (isShellTag(tag)) {
    validateShell(element, tag, frame.parentTag, location, report);
    return;
  }
  if (!isAllowedBodyElement(tag)) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'element', element: tag }),
    );
    if (tag === 'style') {
      scanCss(elementText(element), tag, location, report);
    }
    return;
  }

  rejectDisallowedAttributes(element, tag, location, report);
  for (const className of classes) {
    if (!isAllowedClass(tag, className)) {
      report.diagnostics.push(
        makeDiagnostic('E_HTML_INVALID', location, {
          reason: 'class',
          element: tag,
          class: className,
        }),
      );
    }
  }

  if (tag === 'article') {
    report.articleCount += 1;
  }
  if (tag === 'section' && classes.includes('slide')) {
    report.slideCount += 1;
  }
  if (tag === 'ul' && classes.includes('tasks')) {
    report.taskListCount += 1;
  }
  if (tag === 'section' && report.type === 'doc' && id === null) {
    report.diagnostics.push(
      makeDiagnostic('E_TYPE_STRUCTURE', location, {
        reason: 'section-id',
        type: 'doc',
        element: 'section',
        className: '',
      }),
    );
  }
  if (
    frame.parentTag === 'ul' &&
    frame.parentClasses.includes('tasks') &&
    !(tag === 'li' && hasAttribute(element, 'data-g-task'))
  ) {
    report.diagnostics.push(makeDiagnostic('E_TASK_INVALID', location, { reason: 'child' }));
  }
  if (tag === 'li') {
    validateListItem(element, frame, id, location, report);
  }
  if (tag === 'a') {
    validateAnchor(element, location, report);
  }
  if (tag === 'img') {
    validateImage(element, location, report);
  }
  if (tag === 'aside') {
    validateAside(element, classes, location, report);
  }
  if (tag === 'gaveta-embed') {
    validateEmbed(element, location, report);
  }
  if (tag === 'input' && !frame.inTask) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'input', element: 'input' }),
    );
  }
  if (tag === 'time') {
    const datetime = trimmed(attribute(element, 'datetime'));
    if (datetime !== null && !isIso8601(datetime)) {
      report.diagnostics.push(
        makeDiagnostic('E_HTML_INVALID', location, { reason: 'datetime', element: 'time' }),
      );
    }
  }
  if (tag === 'th' || tag === 'td') {
    validateSpan(element, tag, 'colspan', location, report);
    validateSpan(element, tag, 'rowspan', location, report);
  }
  if (tag === 'source') {
    const type = attribute(element, 'type');
    if (type !== null && (type.trim().length === 0 || /\s/.test(type.trim()))) {
      report.diagnostics.push(
        makeDiagnostic('E_HTML_INVALID', location, {
          reason: 'attribute',
          element: 'source',
          attribute: 'type',
        }),
      );
    }
  }
}

function validateShell(
  element: ParseElement,
  tag: string,
  parentTag: string | null,
  location: SourceLocation | null,
  report: Report,
): void {
  if ((tag === 'title' || tag === 'meta' || tag === 'link') && parentTag !== 'head') {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'element', element: tag }),
    );
    return;
  }
  if (tag === 'html') {
    rejectExcept(element, new Set(['lang']), tag, location, report);
    return;
  }
  if (tag === 'head' || tag === 'body') {
    rejectExcept(element, new Set(), tag, location, report);
    return;
  }
  if (tag === 'title') {
    rejectExcept(element, new Set(), tag, location, report);
    return;
  }
  if (tag === 'meta') {
    validateMeta(element, location, report);
    return;
  }
  if (tag === 'link') {
    validateStylesheet(element, location, report);
  }
}

function validateMeta(
  element: ParseElement,
  location: SourceLocation | null,
  report: Report,
): void {
  const charset = attribute(element, 'charset');
  if (charset !== null) {
    if (charset.trim().toLowerCase() !== DOCUMENT_SHELL.charset) {
      report.diagnostics.push(makeDiagnostic('E_HTML_INVALID', location, { reason: 'charset' }));
    }
    rejectExcept(element, new Set(['charset']), 'meta', location, report);
    return;
  }
  const equiv = trimmed(attribute(element, 'http-equiv'));
  if (equiv !== null) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, {
        reason: equiv.toLowerCase() === 'refresh' ? 'meta-refresh' : 'meta',
      }),
    );
    if (equiv.toLowerCase() === 'refresh') {
      const target = refreshTarget(attribute(element, 'content') ?? '');
      if (target !== null && isRemoteUrl(target) && !isAllowlisted(target, report.allowlist)) {
        report.diagnostics.push(
          makeDiagnostic('W_REMOTE_RESOURCE', location, {
            element: 'meta',
            attribute: 'content',
            url: target,
          }),
        );
      }
    }
    return;
  }
  const name = trimmed(attribute(element, 'name'));
  if (name !== null && META_NAMES.has(name.toLowerCase())) {
    rejectExcept(element, new Set(['name', 'content']), 'meta', location, report);
    return;
  }
  report.diagnostics.push(makeDiagnostic('E_HTML_INVALID', location, { reason: 'meta' }));
}

function validateStylesheet(
  element: ParseElement,
  location: SourceLocation | null,
  report: Report,
): void {
  const tokens = relTokens(trimmed(attribute(element, 'rel')));
  const href = trimmed(attribute(element, 'href'));
  const stylesheet = tokens.length === 1 && tokens[0]?.toLowerCase() === 'stylesheet';
  if (!stylesheet || href === null) {
    report.diagnostics.push(makeDiagnostic('E_HTML_INVALID', location, { reason: 'link' }));
  }
  rejectExcept(element, new Set(['rel', 'href']), 'link', location, report);
}

function validateListItem(
  element: ParseElement,
  frame: Frame,
  id: string | null,
  location: SourceLocation | null,
  report: Report,
): void {
  const due = trimmed(attribute(element, 'data-g-due'));
  if (due !== null && !isIso8601(due)) {
    report.diagnostics.push(makeDiagnostic('E_TASK_INVALID', location, { reason: 'due' }));
  }
  const priority = trimmed(attribute(element, 'data-g-priority'));
  if (priority !== null && !isTaskPriority(priority)) {
    report.diagnostics.push(makeDiagnostic('E_TASK_INVALID', location, { reason: 'priority' }));
  }
  if (!hasAttribute(element, 'data-g-task')) {
    return;
  }
  const inTaskList = frame.parentTag === 'ul' && frame.parentClasses.includes('tasks');
  if (!inTaskList) {
    report.diagnostics.push(makeDiagnostic('E_TASK_INVALID', location, { reason: 'parent' }));
  }
  if (id === null) {
    report.diagnostics.push(makeDiagnostic('E_TASK_INVALID', location, { reason: 'id' }));
  }
  const inputs = countTaskInputs(element);
  if (inputs.checkbox !== 1 || inputs.other !== 0) {
    report.diagnostics.push(makeDiagnostic('E_TASK_INVALID', location, { reason: 'checkbox' }));
  }
}

function countTaskInputs(element: ParseElement): { checkbox: number; other: number } {
  let checkbox = 0;
  let other = 0;
  const stack: ParseElement[] = [];
  pushChildElements(stack, element);
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'li') {
      continue;
    }
    if (tag === 'input') {
      const type = trimmed(attribute(node, 'type'));
      if (type !== null && type.toLowerCase() === 'checkbox') {
        checkbox += 1;
      } else {
        other += 1;
      }
    }
    pushChildElements(stack, node);
  }
  return { checkbox, other };
}

function pushChildElements(stack: ParseElement[], element: ParseElement): void {
  const nodes = childNodes(element);
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node !== undefined && isElementNode(node)) {
      stack.push(node);
    }
  }
}

function validateAnchor(
  element: ParseElement,
  location: SourceLocation | null,
  report: Report,
): void {
  const href = trimmed(attribute(element, 'href'));
  const targetId = trimmed(attribute(element, 'data-g-to'));
  const pending = trimmed(attribute(element, 'data-g-pending'));
  if (targetId !== null && pending !== null) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'conflict', element: 'a' }),
    );
  }
  if (targetId !== null) {
    if (href === null) {
      report.diagnostics.push(
        makeDiagnostic('E_HTML_INVALID', location, { reason: 'href', element: 'a' }),
      );
    }
  } else if (pending !== null) {
    report.diagnostics.push(makeDiagnostic('W_LINK_PENDING', location, { title: pending }));
  } else if (href === null) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'anchor', element: 'a' }),
    );
  }
  if (
    href !== null &&
    isExternalLink(href) &&
    !relTokens(trimmed(attribute(element, 'rel'))).includes('noopener')
  ) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'noopener', element: 'a' }),
    );
  }
  const severity = report.strictRel ? 'error' : undefined;
  for (const token of relTokens(trimmed(attribute(element, 'rel')))) {
    if (SAFE_REL.has(token) || report.vocabulary.has(token)) {
      continue;
    }
    report.diagnostics.push(
      makeDiagnostic('W_REL_UNKNOWN', location, { rel: token }, {}, severity),
    );
  }
}

function validateImage(
  element: ParseElement,
  location: SourceLocation | null,
  report: Report,
): void {
  if (attribute(element, 'alt') === null) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'alt', element: 'img' }),
    );
  }
  if (trimmed(attribute(element, 'src')) === null) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'src', element: 'img' }),
    );
  }
}

function validateAside(
  element: ParseElement,
  classes: readonly string[],
  location: SourceLocation | null,
  report: Report,
): void {
  const kind = trimmed(attribute(element, 'data-kind'));
  if (classes.includes('callout')) {
    if (kind === null || !isCalloutKind(kind)) {
      report.diagnostics.push(
        makeDiagnostic('E_HTML_INVALID', location, { reason: 'kind', element: 'aside' }),
      );
    }
    return;
  }
  if (kind !== null) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'kind', element: 'aside' }),
    );
  }
}

function validateEmbed(
  element: ParseElement,
  location: SourceLocation | null,
  report: Report,
): void {
  const target = trimmed(attribute(element, 'data-g-to'));
  if (target === null) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'embed', element: 'gaveta-embed' }),
    );
    return;
  }
  if (!isUlid(target)) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'id', element: 'gaveta-embed' }),
    );
  }
}

function validateSpan(
  element: ParseElement,
  tag: string,
  name: 'colspan' | 'rowspan',
  location: SourceLocation | null,
  report: Report,
): void {
  const raw = attribute(element, name);
  if (raw === null) {
    return;
  }
  if (!/^[1-9][0-9]*$/.test(raw.trim())) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: name, element: tag }),
    );
  }
}

function appendStructure(report: Report): void {
  const type = report.type;
  if (type === null) {
    return;
  }
  const required = NOTE_TYPE_STRUCTURES[type].required;
  for (const rule of required) {
    const count = structureCount(report, rule.element, rule.className);
    if (count < rule.min) {
      report.diagnostics.push(
        makeDiagnostic('E_TYPE_STRUCTURE', null, {
          reason: 'required',
          type,
          element: rule.element,
          className: rule.className ?? '',
        }),
      );
    }
  }
}

function structureCount(report: Report, element: string, className: string | null): number {
  if (element === 'article') {
    return report.articleCount;
  }
  if (element === 'section' && className === 'slide') {
    return report.slideCount;
  }
  if (element === 'ul' && className === 'tasks') {
    return report.taskListCount;
  }
  return 0;
}

function rejectDisallowedAttributes(
  element: ParseElement,
  tag: string,
  location: SourceLocation | null,
  report: Report,
): void {
  for (const attr of element.attrs) {
    const name = attr.name.toLowerCase();
    if (isEventHandlerAttribute(name) || name === INLINE_STYLE_ATTRIBUTE) {
      continue;
    }
    if (!isAllowedAttribute(tag, name)) {
      report.diagnostics.push(
        makeDiagnostic('E_HTML_INVALID', location, {
          reason: 'attribute',
          element: tag,
          attribute: name,
        }),
      );
    }
  }
}

function rejectExcept(
  element: ParseElement,
  allowed: ReadonlySet<string>,
  tag: string,
  location: SourceLocation | null,
  report: Report,
): void {
  for (const attr of element.attrs) {
    const name = attr.name.toLowerCase();
    if (!allowed.has(name)) {
      report.diagnostics.push(
        makeDiagnostic('E_HTML_INVALID', location, {
          reason: 'attribute',
          element: tag,
          attribute: name,
        }),
      );
    }
  }
}

function scanUrlsAndStyle(
  element: ParseElement,
  tag: string,
  location: SourceLocation | null,
  report: Report,
): void {
  for (const attr of element.attrs) {
    const name = attr.name.toLowerCase();
    if (isEventHandlerAttribute(name)) {
      continue;
    }
    if (name === INLINE_STYLE_ATTRIBUTE) {
      recordStyle(attr.value, tag, location, report);
      continue;
    }
    if (isUrlAttribute(name)) {
      scanUrlValue(tag, name, attr.value, location, report);
    }
  }
}

function recordStyle(
  value: string,
  element: string,
  location: SourceLocation | null,
  report: Report,
): void {
  report.styleCount += 1;
  report.styleLocation ??= location;
  scanCss(value, element, location, report);
}

function scanCss(
  value: string,
  element: string,
  location: SourceLocation | null,
  report: Report,
): void {
  for (const reference of cssReferences(value)) {
    inspectReference(element, 'style', reference, location, report);
  }
}

function scanUrlValue(
  element: string,
  attributeName: string,
  value: string,
  location: SourceLocation | null,
  report: Report,
): void {
  if (attributeName === 'srcset') {
    for (const candidate of srcsetUrls(value)) {
      inspectReference(element, attributeName, candidate, location, report);
    }
    return;
  }
  inspectReference(element, attributeName, value, location, report);
}

function inspectReference(
  element: string,
  attributeName: string,
  value: string,
  location: SourceLocation | null,
  report: Report,
): void {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return;
  }
  if (isJavascriptUrl(trimmedValue)) {
    if (!parserOwnsJavascript(attributeName)) {
      report.diagnostics.push(
        makeDiagnostic('E_UNSAFE_URL', location, { element, attribute: attributeName }),
      );
    }
    return;
  }
  if (isRemoteUrl(trimmedValue)) {
    if (element !== 'a' && !isAllowlisted(trimmedValue, report.allowlist)) {
      report.diagnostics.push(
        makeDiagnostic('W_REMOTE_RESOURCE', location, {
          element,
          attribute: attributeName,
          url: trimmedValue,
        }),
      );
    }
    return;
  }
  if (escapesVault(trimmedValue, report.basePath)) {
    report.diagnostics.push(
      makeDiagnostic('E_PATH_OUTSIDE_VAULT', location, {
        element,
        attribute: attributeName,
        reference: trimmedValue,
      }),
    );
  }
}

function parserOwnsJavascript(attributeName: string): boolean {
  return URL_ATTRIBUTES.has(attributeName) || attributeName.endsWith(':href');
}

function isUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTES.has(name) || name.endsWith(':href');
}

function isExternalLink(href: string): boolean {
  if (isJavascriptUrl(href) || /^file:/i.test(href) || /^[a-zA-Z]:[\\/]/.test(href)) {
    return false;
  }
  return isRemoteUrl(href) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href);
}

function isAllowlisted(url: string, allowlist: ReadonlySet<string>): boolean {
  const host = remoteHost(url);
  return host !== null && allowlist.has(host);
}

function escapesVault(reference: string, notePath: string | null): boolean {
  const trimmedValue = reference.trim();
  if (trimmedValue.length === 0 || trimmedValue.startsWith('#')) {
    return false;
  }
  if (trimmedValue.includes('\0') || trimmedValue.includes('\\') || trimmedValue.startsWith('/')) {
    return true;
  }
  if (/^[a-zA-Z]:[\\/]/.test(trimmedValue) || /^file:/i.test(trimmedValue)) {
    return true;
  }
  if (isRemoteUrl(trimmedValue) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedValue)) {
    return false;
  }
  const withoutHash = trimmedValue.split('#')[0] ?? '';
  const pathOnly = (withoutHash.split('?')[0] ?? '').trim();
  if (pathOnly.length === 0) {
    return false;
  }
  const decoded = decodePercents(pathOnly);
  if (
    decoded === null ||
    decoded.includes('\0') ||
    decoded.includes('\\') ||
    decoded.startsWith('/') ||
    decoded.startsWith('//')
  ) {
    return true;
  }
  if (notePath === null) {
    return false;
  }
  return resolveInside(notePath, decoded) === null;
}

function resolveInside(notePath: string, reference: string): string | null {
  const slash = notePath.lastIndexOf('/');
  const dir = slash === -1 ? '' : notePath.slice(0, slash);
  const combined = dir.length === 0 ? reference : `${dir}/${reference}`;
  const segments: string[] = [];
  for (const segment of combined.split('/')) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

function decodePercents(value: string): string | null {
  let current = value;
  for (let round = 0; round < 3; round += 1) {
    if (!current.includes('%')) {
      return current;
    }
    if (!/%[0-9A-Fa-f]{2}/.test(current)) {
      return current;
    }
    const next = current.replace(/%([0-9A-Fa-f]{2})/g, (_match: string, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current.includes('%') ? null : current;
}

function cssReferences(value: string): string[] {
  const found: string[] = [];
  const lower = value.toLowerCase();
  let cursor = 0;
  while (cursor < value.length) {
    const urlAt = lower.indexOf('url(', cursor);
    const importAt = lower.indexOf('@import', cursor);
    if (urlAt === -1 && importAt === -1) {
      break;
    }
    if (urlAt !== -1 && (importAt === -1 || urlAt < importAt)) {
      const read = readCssUrl(value, urlAt + 4);
      if (read.value !== null && read.value.length > 0) {
        found.push(read.value);
      }
      cursor = Math.max(read.next, urlAt + 4);
      continue;
    }
    const read = readImport(value, importAt + 7);
    if (read.value !== null && read.value.length > 0) {
      found.push(read.value);
    }
    cursor = Math.max(read.next, importAt + 7);
  }
  return found;
}

function readCssUrl(value: string, start: number): { value: string | null; next: number } {
  let index = start;
  while (index < value.length && isSpace(value[index])) {
    index += 1;
  }
  const quote = value[index];
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, index + 1);
    if (end === -1) {
      return { value: value.slice(index + 1).trim(), next: value.length };
    }
    return { value: value.slice(index + 1, end).trim(), next: end + 1 };
  }
  const end = value.indexOf(')', index);
  if (end === -1) {
    return { value: value.slice(index).trim(), next: value.length };
  }
  return { value: value.slice(index, end).trim(), next: end + 1 };
}

function readImport(value: string, start: number): { value: string | null; next: number } {
  let index = start;
  while (index < value.length && isSpace(value[index])) {
    index += 1;
  }
  if (value.slice(index, index + 4).toLowerCase() === 'url(') {
    return { value: null, next: index };
  }
  const quote = value[index];
  if (quote === '"' || quote === "'") {
    const end = value.indexOf(quote, index + 1);
    if (end === -1) {
      return { value: value.slice(index + 1).trim(), next: value.length };
    }
    return { value: value.slice(index + 1, end).trim(), next: end + 1 };
  }
  return { value: null, next: index + 1 };
}

function refreshTarget(content: string): string | null {
  const at = content.toLowerCase().indexOf('url');
  if (at === -1) {
    return null;
  }
  let index = at + 3;
  while (index < content.length && isSpace(content[index])) {
    index += 1;
  }
  if (content[index] !== '=') {
    return null;
  }
  index += 1;
  while (index < content.length && isSpace(content[index])) {
    index += 1;
  }
  const quote = content[index];
  if (quote === '"' || quote === "'") {
    const end = content.indexOf(quote, index + 1);
    const raw = end === -1 ? content.slice(index + 1) : content.slice(index + 1, end);
    const text = raw.trim();
    return text.length === 0 ? null : text;
  }
  let end = index;
  while (end < content.length && content[end] !== ';' && !isSpace(content[end])) {
    end += 1;
  }
  const text = content.slice(index, end).trim();
  return text.length === 0 ? null : text;
}

function srcsetUrls(value: string): string[] {
  const urls: string[] = [];
  for (const part of value.split(',')) {
    const token = part.trim().split(/\s+/)[0];
    if (token !== undefined && token.length > 0) {
      urls.push(token);
    }
  }
  return urls;
}

function remoteHost(value: string): string | null {
  const trimmedValue = value.trim();
  const candidate = trimmedValue.startsWith('//') ? `https:${trimmedValue}` : trimmedValue;
  try {
    const host = new URL(candidate).hostname.toLowerCase();
    return host.length === 0 ? null : host;
  } catch {
    return null;
  }
}

function allowlistHosts(entries: readonly string[]): Set<string> {
  const hosts = new Set<string>();
  for (const entry of entries) {
    const host = allowlistHost(entry);
    if (host !== null) {
      hosts.add(host);
    }
  }
  return hosts;
}

function allowlistHost(entry: string): string | null {
  const trimmedValue = entry.trim();
  if (trimmedValue.length === 0) {
    return null;
  }
  if (trimmedValue.includes('://') || trimmedValue.startsWith('//')) {
    return remoteHost(trimmedValue);
  }
  const lower = trimmedValue.toLowerCase();
  const slash = lower.indexOf('/');
  const hostPort = slash === -1 ? lower : lower.slice(0, slash);
  const colon = hostPort.lastIndexOf(':');
  if (colon > 0 && !hostPort.startsWith('[')) {
    return hostPort.slice(0, colon);
  }
  return hostPort.length === 0 ? null : hostPort;
}

function isSafeNotePath(value: string): boolean {
  if (value.length === 0 || value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
    return false;
  }
  for (const segment of value.split('/')) {
    if (segment.length === 0 || segment === '.' || segment === '..') {
      return false;
    }
  }
  return true;
}

function isShellTag(tag: string): boolean {
  return (DOCUMENT_SHELL.elements as readonly string[]).includes(tag);
}

function readId(
  element: ParseElement,
  location: SourceLocation | null,
  report: Report,
): string | null {
  const raw = attribute(element, 'id');
  if (raw === null) {
    return null;
  }
  const text = raw.trim();
  if (text.length === 0 || /\s/.test(text)) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, {
        reason: 'id',
        element: element.tagName.toLowerCase(),
      }),
    );
    return null;
  }
  if (report.ids.has(text)) {
    report.diagnostics.push(
      makeDiagnostic('E_HTML_INVALID', location, { reason: 'duplicate-id', id: text }),
    );
    return text;
  }
  report.ids.add(text);
  return text;
}

function relTokens(value: string | null): string[] {
  if (value === null) {
    return [];
  }
  const tokens: string[] = [];
  for (const part of value.split(/\s+/)) {
    if (part.length > 0) {
      tokens.push(part);
    }
  }
  return tokens;
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

function trimmed(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const text = value.trim();
  return text.length === 0 ? null : text;
}

function elementText(element: ParseElement): string {
  let text = '';
  const stack: ParseChild[] = [];
  const nodes = childNodes(element);
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node !== undefined) {
      stack.push(node);
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
    const children = childNodes(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return text;
}

function childNodes(element: ParseElement): readonly ParseChild[] {
  if (isTemplateElement(element)) {
    return element.content.childNodes;
  }
  return element.childNodes;
}

function elementLocation(element: ParseElement): SourceLocation | null {
  const location = element.sourceCodeLocation;
  if (location === undefined || location === null) {
    return null;
  }
  return { line: location.startLine, column: location.startCol };
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

function isSpace(character: string | undefined): boolean {
  return (
    character === ' ' ||
    character === '\n' ||
    character === '\t' ||
    character === '\r' ||
    character === '\f'
  );
}
