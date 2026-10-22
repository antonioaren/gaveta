/**
 * Add, toggle, and list tasks with minimal HTML splices.
 * Writes reuse the same resolve, validate, and index path as `editNote`.
 */
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  allocateSlug,
  isIso8601,
  isNoteType,
  isTaskPriority,
  slugify,
  type NoteType,
} from './contract.ts';
import { GavetaError, isErrorCode, isWarningCode, type DiagnosticCode } from './errors.ts';
import { escapeAttr, escapeText } from './links/path.ts';
import { resolveNoteLinks } from './links/rewrite.ts';
import type { LinkDiagnostic, RelPolicy } from './links/types.ts';
import { resolveRef } from './links/ref.ts';
import { parseNote } from './parser.ts';
import type { VaultIndex } from './sqlite/store.ts';
import { openVaultIndex } from './sqlite/store.ts';
import { validateNote } from './validate.ts';
import type { VaultConfig } from './vault/config.ts';
import { readVaultConfig } from './vault/config.ts';
import { readVaultText, writeVaultText } from './vault/paths.ts';
import { noteContentHash, type NoteWarning, type NoteWriteFailure } from './notes.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];

const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

const ADD_KEYS = ['vaultRoot', 'ref', 'text', 'section', 'due', 'priority', 'ifMatch'] as const;
const CHECK_KEYS = ['vaultRoot', 'ref', 'taskId', 'ifMatch'] as const;
const LIST_KEYS = ['vaultRoot', 'ref', 'open', 'done', 'type', 'tag'] as const;

export interface ListedTask {
  readonly path: string;
  readonly noteId: string | null;
  readonly noteTitle: string;
  readonly noteType: NoteType | null;
  readonly taskId: string | null;
  readonly text: string;
  readonly checked: boolean;
  readonly due: string | null;
  readonly priority: string | null;
  readonly sectionId: string | null;
}

export interface TaskMutationSuccess {
  readonly ok: true;
  readonly id: string;
  readonly path: string;
  readonly hash: string;
  readonly title: string;
  readonly type: NoteType;
  readonly taskId: string;
  readonly checked: boolean;
  readonly warnings: readonly NoteWarning[];
}

export type AddTaskResult = TaskMutationSuccess | NoteWriteFailure;
export type ToggleTaskResult = TaskMutationSuccess | NoteWriteFailure;

export interface ListTasksResult {
  readonly tasks: readonly ListedTask[];
  readonly warnings: readonly NoteWarning[];
}

interface Session {
  readonly root: string;
  readonly config: VaultConfig;
  readonly index: VaultIndex;
  readonly warnings: NoteWarning[];
}

interface TagSpan {
  readonly startOffset: number;
  readonly endOffset: number;
}

interface DiagnosticLike {
  readonly code: DiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly details: Readonly<Record<string, unknown>> | null;
}

export async function addTaskToNote(options: unknown): Promise<AddTaskResult> {
  const input = readAdd(options);
  return withSession(input.vaultRoot, async (session) => {
    const target = resolveRef(session.index, input.ref);
    const original = await readVaultText(session.root, target.path);
    assertMatch(noteContentHash(original), input.ifMatch);
    const parsed = parseNote(original);
    if (!parsed.ok || parsed.note === null) {
      throw new GavetaError('E_HTML_INVALID');
    }
    const taskId = allocateTaskId(parsed.note.tasks, input.text);
    const inserted = insertTaskMarkup(
      original,
      input.section,
      buildTaskMarkup(taskId, input.text, input.due, input.priority),
    );
    return persistTaskEdit(
      session,
      target,
      original,
      inserted.html,
      taskId,
      false,
      inserted.warnings,
    );
  });
}

export async function checkTask(options: unknown): Promise<ToggleTaskResult> {
  const input = readToggle(options);
  return toggleTask(input, true);
}

export async function uncheckTask(options: unknown): Promise<ToggleTaskResult> {
  const input = readToggle(options);
  return toggleTask(input, false);
}

export async function listTasks(options: unknown): Promise<ListTasksResult> {
  const input = readList(options);
  return withSession(input.vaultRoot, (session) => {
    const indexed = session.index.tasks(
      input.ref === null ? undefined : resolvePath(session, input.ref),
    );
    const tasks: ListedTask[] = [];
    for (const task of indexed) {
      const note = session.index.note(task.path);
      if (note === null) {
        continue;
      }
      if (input.type !== null && note.type !== input.type) {
        continue;
      }
      if (input.tag !== null && !note.tags.includes(input.tag)) {
        continue;
      }
      if (input.open && task.checked) {
        continue;
      }
      if (input.done && !task.checked) {
        continue;
      }
      tasks.push({
        path: task.path,
        noteId: note.id,
        noteTitle: note.title,
        noteType: note.type,
        taskId: task.taskId,
        text: task.text,
        checked: task.checked,
        due: task.due,
        priority: task.priority,
        sectionId: task.sectionId,
      });
    }
    tasks.sort((left, right) => {
      const byPath = left.path.localeCompare(right.path);
      if (byPath !== 0) {
        return byPath;
      }
      return (left.taskId ?? '').localeCompare(right.taskId ?? '');
    });
    return Promise.resolve({ tasks, warnings: session.warnings });
  });
}

async function toggleTask(
  input: {
    readonly vaultRoot: string;
    readonly ref: string;
    readonly taskId: string;
    readonly ifMatch: string | undefined;
  },
  checked: boolean,
): Promise<ToggleTaskResult> {
  return withSession(input.vaultRoot, async (session) => {
    const target = resolveRef(session.index, input.ref);
    const original = await readVaultText(session.root, target.path);
    assertMatch(noteContentHash(original), input.ifMatch);
    const patched = patchTaskChecked(original, input.taskId, checked);
    return persistTaskEdit(
      session,
      target,
      original,
      patched.html,
      input.taskId,
      checked,
      patched.warnings,
    );
  });
}

function resolvePath(session: Session, ref: string): string {
  return resolveRef(session.index, ref).path;
}

async function persistTaskEdit(
  session: Session,
  target: { readonly path: string; readonly title: string },
  original: string,
  spliced: string,
  taskId: string,
  checked: boolean,
  extraWarnings: readonly NoteWarning[],
): Promise<TaskMutationSuccess | NoteWriteFailure> {
  const resolved = resolveFor(session, spliced, target.path);
  const resolveGate = gate(resolved.errors);
  if (!resolveGate.ok) {
    return failure(session, resolveGate, extraWarnings);
  }
  const validated = validateNote(resolved.html, validateOptions(session, target.path));
  const validateGate = gate(asLikes(validated.diagnostics));
  if (!validateGate.ok) {
    return failure(session, validateGate, extraWarnings);
  }
  if (validated.note?.id == null || validated.note.type == null) {
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
    taskId,
    checked,
    warnings: [...session.warnings, ...extraWarnings, ...warningList(resolved.warnings)],
  };
}

function buildTaskMarkup(
  taskId: string,
  text: string,
  due: string | null,
  priority: string | null,
): string {
  const attrs = [`data-g-task=""`, `id="${escapeAttr(taskId)}"`];
  if (due !== null) {
    attrs.push(`data-g-due="${escapeAttr(due)}"`);
  }
  if (priority !== null) {
    attrs.push(`data-g-priority="${escapeAttr(priority)}"`);
  }
  return `<li ${attrs.join(' ')}><input type="checkbox" />${escapeText(text)}</li>`;
}

function allocateTaskId(tasks: readonly { readonly id: string | null }[], text: string): string {
  const taken = new Set<string>();
  for (const task of tasks) {
    if (task.id !== null && task.id.length > 0) {
      taken.add(task.id);
    }
  }
  const base = slugify(text) || 'tarea';
  return allocateSlug(base, taken);
}

function insertTaskMarkup(
  html: string,
  sectionId: string | null,
  markup: string,
): { readonly html: string; readonly warnings: readonly NoteWarning[] } {
  const document = parseDocument(html);
  const list = findTaskList(document, sectionId);
  if (list.kind === 'missing-section') {
    throw new GavetaError('E_SECTION_NOT_FOUND');
  }
  if (list.kind === 'create') {
    const created = insertNewTaskList(html, list.container, markup);
    return { html: created, warnings: [] };
  }
  const spans = elementSpans(list.element);
  if (spans === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const innerStart = spans.startTag.endOffset;
  const innerEnd = spans.endTag.startOffset;
  const inner = html.slice(innerStart, innerEnd);
  const indent = taskListIndent(inner, html, innerStart);
  const piece = inner.trim().length === 0 ? `\n${indent}${markup}\n` : `\n${indent}${markup}`;
  const close = html.slice(0, innerEnd) + piece + html.slice(innerEnd);
  return { html: close, warnings: [] };
}

function insertNewTaskList(html: string, container: ParseElement, markup: string): string {
  const spans = elementSpans(container);
  if (spans === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const indent = lineIndent(html, spans.startTag.endOffset);
  const childIndent = `${indent}  `;
  const block = `\n${indent}<ul class="tasks">\n${childIndent}${markup}\n${indent}</ul>\n`;
  return html.slice(0, spans.endTag.startOffset) + block + html.slice(spans.endTag.startOffset);
}

type TaskListLookup =
  | { readonly kind: 'found'; readonly element: ParseElement }
  | { readonly kind: 'create'; readonly container: ParseElement }
  | { readonly kind: 'missing-section' };

function primaryArticle(document: ParseDocument): ParseElement | null {
  const articles = collectElements(
    document,
    (element) => elementName(element) === 'article',
  );
  return articles[0] ?? null;
}

function findTaskList(document: ParseDocument, sectionId: string | null): TaskListLookup {
  const article = primaryArticle(document);
  const scope: ParseDocument | ParseElement = article ?? document;
  if (sectionId !== null) {
    if (article === null) {
      return { kind: 'missing-section' };
    }
    const sections = collectElements(
      article,
      (element) => elementName(element) === 'section' && attr(element, 'id') === sectionId,
    );
    if (sections.length === 0) {
      return { kind: 'missing-section' };
    }
    const section = sections[0];
    if (section === undefined) {
      return { kind: 'missing-section' };
    }
    const lists = collectElements(
      section,
      (element) => elementName(element) === 'ul' && hasClass(element, 'tasks'),
    );
    if (lists.length > 0) {
      const list = lists[0];
      if (list !== undefined) {
        return { kind: 'found', element: list };
      }
    }
    return { kind: 'create', container: section };
  }
  const lists = collectElements(
    scope,
    (element) => elementName(element) === 'ul' && hasClass(element, 'tasks'),
  );
  if (lists.length > 0) {
    const list = lists[0];
    if (list !== undefined) {
      return { kind: 'found', element: list };
    }
  }
  if (article !== null) {
    return { kind: 'create', container: article };
  }
  const body = findBody(document);
  if (body !== null) {
    return { kind: 'create', container: body };
  }
  throw new GavetaError('E_HTML_INVALID');
}

function patchTaskChecked(
  html: string,
  taskId: string,
  checked: boolean,
): { readonly html: string; readonly warnings: readonly NoteWarning[] } {
  const document = parseDocument(html);
  const article = primaryArticle(document);
  const scope: ParseDocument | ParseElement = article ?? document;
  const items = collectElements(
    scope,
    (element) =>
      elementName(element) === 'li' &&
      attr(element, 'data-g-task') !== null &&
      attr(element, 'id') === taskId,
  );
  if (items.length === 0) {
    throw new GavetaError('E_TASK_NOT_FOUND');
  }
  const item = items[0];
  if (item === undefined) {
    throw new GavetaError('E_TASK_NOT_FOUND');
  }
  const checkbox = findCheckbox(item);
  if (checkbox === null) {
    throw new GavetaError('E_TASK_INVALID');
  }
  const tagSpan = inputTagSpan(checkbox);
  if (tagSpan === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const tag = html.slice(tagSpan.startOffset, tagSpan.endOffset);
  const nextTag = setCheckedOnInputTag(tag, checked);
  if (nextTag === tag) {
    return { html, warnings: [] };
  }
  return {
    html: html.slice(0, tagSpan.startOffset) + nextTag + html.slice(tagSpan.endOffset),
    warnings: [],
  };
}

function inputTagSpan(element: ParseElement): TagSpan | null {
  const location: unknown = element.sourceCodeLocation;
  if (!isRecord(location)) {
    return null;
  }
  const startTag = spanOf(location.startTag);
  if (startTag === null) {
    return null;
  }
  const endTag = spanOf(location.endTag);
  if (endTag !== null) {
    return { startOffset: startTag.startOffset, endOffset: endTag.endOffset };
  }
  return startTag;
}

function setCheckedOnInputTag(tag: string, checked: boolean): string {
  const hasChecked = /\schecked(?:\s*=|\s|>|\/)/i.test(tag);
  if (checked) {
    if (hasChecked) {
      return tag;
    }
    if (tag.endsWith('/>')) {
      return `${tag.slice(0, -2).trimEnd()} checked />`;
    }
    if (tag.endsWith('>')) {
      return `${tag.slice(0, -1).trimEnd()} checked>`;
    }
    return tag;
  }
  if (!hasChecked) {
    return tag;
  }
  return tag
    .replace(/\s+checked(?:="[^"]*"|='[^']*'|=[^\s>]+)?/gi, '')
    .replace(/\s+checked(?=\s|>|\/)/gi, '');
}

function findCheckbox(item: ParseElement): ParseElement | null {
  const stack: ParseElement[] = [...childrenElements(item)];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (elementName(node) === 'input' && attr(node, 'type') === 'checkbox') {
      return node;
    }
    if (elementName(node) === 'li') {
      continue;
    }
    stack.push(...childrenElements(node));
  }
  return null;
}

function childrenElements(element: ParseElement): ParseElement[] {
  const found: ParseElement[] = [];
  for (const child of element.childNodes) {
    if (isElementNode(child)) {
      found.push(child);
    }
  }
  return found;
}

function taskListIndent(inner: string, html: string, innerStart: number): string {
  const li = inner.lastIndexOf('<li');
  if (li !== -1) {
    const absolute = innerStart + li;
    return lineIndent(html, absolute);
  }
  const ulLine = lineIndent(html, innerStart);
  return `${ulLine}  `;
}

function lineIndent(html: string, offset: number): string {
  const lineStart = html.lastIndexOf('\n', offset - 1) + 1;
  let index = lineStart;
  let spaces = '';
  while (index < html.length) {
    const char = html[index];
    if (char === ' ') {
      spaces += ' ';
      index += 1;
      continue;
    }
    if (char === '\t') {
      spaces += '\t';
      index += 1;
      continue;
    }
    break;
  }
  return spaces.length > 0 ? spaces : '  ';
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

function assertMatch(current: string, expected: string | undefined): void {
  if (expected === undefined) {
    return;
  }
  if (current !== expected) {
    throw new GavetaError('E_CONFLICT');
  }
}

function readAdd(options: unknown): {
  readonly vaultRoot: string;
  readonly ref: string;
  readonly text: string;
  readonly section: string | null;
  readonly due: string | null;
  readonly priority: string | null;
  readonly ifMatch: string | undefined;
} {
  const record = readRecord(options, ADD_KEYS);
  const text = requiredString(record.text).trim();
  if (text.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const due = optionalString(record.due) ?? null;
  if (due !== null && !isIso8601(due)) {
    throw new GavetaError('E_TASK_INVALID');
  }
  const priority = optionalString(record.priority) ?? null;
  if (priority !== null && !isTaskPriority(priority)) {
    throw new GavetaError('E_TASK_INVALID');
  }
  const section = optionalString(record.section) ?? null;
  if (section !== null && (section.trim().length === 0 || section.includes('\0'))) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const ifMatch = optionalString(record.ifMatch);
  if (ifMatch !== undefined && !CONTENT_HASH.test(ifMatch)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return {
    vaultRoot: requiredString(record.vaultRoot),
    ref: requiredString(record.ref),
    text,
    section,
    due,
    priority,
    ifMatch,
  };
}

function readToggle(options: unknown): {
  readonly vaultRoot: string;
  readonly ref: string;
  readonly taskId: string;
  readonly ifMatch: string | undefined;
} {
  const record = readRecord(options, CHECK_KEYS);
  const taskId = requiredString(record.taskId).trim();
  if (taskId.length === 0 || /\s/.test(taskId)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const ifMatch = optionalString(record.ifMatch);
  if (ifMatch !== undefined && !CONTENT_HASH.test(ifMatch)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return {
    vaultRoot: requiredString(record.vaultRoot),
    ref: requiredString(record.ref),
    taskId,
    ifMatch,
  };
}

function readList(options: unknown): {
  readonly vaultRoot: string;
  readonly ref: string | null;
  readonly open: boolean;
  readonly done: boolean;
  readonly type: NoteType | null;
  readonly tag: string | null;
} {
  const record = readRecord(options, LIST_KEYS);
  const open = record.open === true;
  const done = record.done === true;
  if (open && done) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const typeValue = optionalString(record.type);
  if (typeValue !== undefined && !isNoteType(typeValue)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const tag = optionalString(record.tag) ?? null;
  if (tag !== null && (tag.trim().length === 0 || tag !== tag.trim())) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const ref = optionalString(record.ref) ?? null;
  return {
    vaultRoot: requiredString(record.vaultRoot),
    ref,
    open,
    done,
    type: typeValue ?? null,
    tag,
  };
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

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
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

type Gate = { readonly ok: true } | NoteWriteFailure;

function gate(diagnostics: readonly DiagnosticLike[]): Gate {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length === 0) {
    return { ok: true };
  }
  const coded = errors.find((diagnostic) => isErrorCode(diagnostic.code));
  if (coded !== undefined && isErrorCode(coded.code)) {
    throw new GavetaError(coded.code);
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

function failure(
  session: Session,
  gateResult: Gate,
  extra: readonly NoteWarning[],
): NoteWriteFailure {
  const failed = gateResult.ok ? extra : gateResult.warnings;
  return { ok: false, warnings: [...session.warnings, ...failed] };
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
    if (name === 'script' || name === 'style' || name === 'template' || name === 'iframe') {
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

function hasClass(element: ParseElement, className: string): boolean {
  const value = attr(element, 'class');
  if (value === null) {
    return false;
  }
  return value.split(/\s+/).includes(className);
}

function isElementNode(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}
