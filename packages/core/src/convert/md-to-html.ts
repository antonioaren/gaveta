/**
 * Markdown → HTML conversion for vault import (REQ-MIG-04).
 * Uses unified/remark/rehype (DEC-07) with Gaveta-specific plugins, then the core normalizer and validator.
 */
import { posix } from 'node:path';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import type { Element, Root as HastRoot, Text as HastText } from 'hast';
import { visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';
import { isNoteType, type NoteType } from '../contract.ts';
import { GavetaError, type WarningCode } from '../errors.ts';
import { escapeAttr, escapeText } from '../links/path.ts';
import { normalizeNote } from '../normalize.ts';
import type { NoteDiagnostic } from '../parser.ts';
import { validateNote } from '../validate.ts';

export interface MarkdownConvertWarning {
  readonly code: WarningCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface MarkdownConvertOptions {
  /** Vault-relative path to the `.md` source (title default and relative assets). */
  readonly sourcePath?: string;
}

export interface MarkdownConvertResult {
  readonly type: NoteType;
  readonly title: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly created: string | null;
  readonly body: string;
  readonly warnings: readonly MarkdownConvertWarning[];
}

export interface FinalizeMarkdownOptions {
  readonly id: string;
  readonly now: string;
  readonly notePath: string;
  readonly remoteAllowlist?: readonly string[];
}

export interface FinalizeMarkdownResult {
  readonly ok: boolean;
  readonly html: string | null;
  readonly warnings: readonly MarkdownConvertWarning[];
  readonly diagnostics: readonly NoteDiagnostic[];
}

const CALLOUT_KIND_MAP: Readonly<Record<string, string>> = {
  note: 'note',
  abstract: 'info',
  info: 'info',
  tip: 'tip',
  success: 'success',
  question: 'info',
  warning: 'warning',
  failure: 'warn',
  danger: 'danger',
  bug: 'danger',
  example: 'info',
  quote: 'note',
  tldr: 'info',
  important: 'warning',
  caution: 'warning',
  error: 'danger',
};

const TASK_DUE_EMOJI = /(?:\u{1F4C5}|\u{1F5D3}\uFE0F?)\s*(\d{4}-\d{2}-\d{2})/u;
const TASK_DONE_EMOJI = /✅\s*(\d{4}-\d{2}-\d{2})/u;
const TASK_SCHED_EMOJI = /⏳\s*(\d{4}-\d{2}-\d{2})/u;
const TASK_DUE_INLINE = /\[due::\s*([^\]]+)\]/i;
const TASK_COMPLETION_INLINE = /\[completion::\s*([^\]]+)\]/i;

export function convertMarkdownToHtml(
  markdown: string,
  options: MarkdownConvertOptions = {},
): MarkdownConvertResult {
  const warnings: MarkdownConvertWarning[] = [];
  const sourcePath = options.sourcePath ?? 'nota.md';
  const { frontMatter, body: afterFrontMatter } = splitFrontMatter(markdown);
  const meta = readFrontMatter(frontMatter, warnings);
  const slidesMode = meta.type === 'slides' || meta.marp;
  const type = resolveNoteType(meta.type, slidesMode);
  const chunks = slidesMode ? splitSlideChunks(afterFrontMatter) : [afterFrontMatter];
  const parts = chunks.map((chunk) => {
    const html = renderMarkdownChunk(chunk, sourcePath, warnings);
    if (!slidesMode) {
      return html;
    }
    const trimmed = html.trim();
    return trimmed.length === 0
      ? '<section class="slide"><h2></h2></section>'
      : `<section class="slide">\n${trimmed}\n</section>`;
  });
  const inner = parts.join('\n');
  const wrapped = wrapForType(type, inner);
  const title = resolveTitle(meta.title, wrapped, sourcePath);
  return {
    type,
    title,
    tags: meta.tags,
    aliases: meta.aliases,
    created: meta.created,
    body: wrapped,
    warnings,
  };
}

export function finalizeMarkdownHtml(
  converted: MarkdownConvertResult,
  options: FinalizeMarkdownOptions,
): FinalizeMarkdownResult {
  const created = converted.created ?? options.now;
  const head = [
    '<meta charset="utf-8">',
    `<title>${escapeText(converted.title)}</title>`,
    `<meta name="gaveta:id" content="${escapeAttr(options.id)}">`,
    `<meta name="gaveta:type" content="${converted.type}">`,
  ];
  if (converted.tags.length > 0) {
    head.push(`<meta name="gaveta:tags" content="${escapeAttr(converted.tags.join(', '))}">`);
  }
  if (converted.aliases.length > 0) {
    head.push(`<meta name="gaveta:aliases" content="${escapeAttr(converted.aliases.join(', '))}">`);
  }
  head.push(`<meta name="gaveta:created" content="${escapeAttr(created)}">`);
  head.push(`<meta name="gaveta:updated" content="${escapeAttr(options.now)}">`);
  const body = stampImportLossesOnContent(converted.body, converted.warnings);
  const shell = `<!doctype html><html lang="es"><head>${head.join('')}</head><body>${body}</body></html>`;
  const normalizeOptions =
    options.remoteAllowlist === undefined
      ? { notePath: options.notePath }
      : { notePath: options.notePath, remoteAllowlist: options.remoteAllowlist };
  const normalized = normalizeNote(shell, normalizeOptions);
  const validation = validateNote(normalized.html ?? '', normalizeOptions);
  const diagnostics = [...normalized.diagnostics, ...validation.diagnostics];
  const ok = normalized.html !== null && validation.ok;
  const noteWarnings = converted.warnings;
  return {
    ok,
    html: normalized.html,
    warnings: noteWarnings,
    diagnostics,
  };
}

function splitFrontMatter(source: string): {
  frontMatter: Record<string, unknown> | null;
  body: string;
} {
  if (!source.startsWith('---\n')) {
    return { frontMatter: null, body: source };
  }
  const end = source.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontMatter: null, body: source };
  }
  const yamlText = source.slice(4, end);
  const body = source.slice(end + 5);
  try {
    const parsed: unknown = parseYaml(yamlText);
    if (parsed === null) {
      return { frontMatter: null, body };
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid front matter');
    }
    return { frontMatter: parsed as Record<string, unknown>, body };
  } catch {
    throw new GavetaError('E_IMPORT_PARSE');
  }
}

interface FrontMatterMeta {
  readonly title: string | null;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly created: string | null;
  readonly type: NoteType | null;
  readonly marp: boolean;
}

function readFrontMatter(
  frontMatter: Record<string, unknown> | null,
  warnings: MarkdownConvertWarning[],
): FrontMatterMeta {
  if (frontMatter === null) {
    return {
      title: null,
      tags: [],
      aliases: [],
      created: null,
      type: null,
      marp: false,
    };
  }
  const title = readString(frontMatter.title);
  const tags = readStringList(frontMatter.tags);
  const aliases = readStringList(frontMatter.aliases);
  const created = readCreated(frontMatter.created);
  const marp = frontMatter.marp === true || frontMatter.marp === 'true';
  const rawType = readString(frontMatter.type);
  let type: NoteType | null = null;
  if (rawType !== null) {
    if (!isNoteType(rawType)) {
      warnings.push({ code: 'W_IMPORT_UNSUPPORTED', params: { detail: `type-${rawType}` } });
    } else {
      type = rawType;
    }
  }
  return { title, tags, aliases, created, type, marp };
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStringList(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

function readCreated(value: unknown): string | null {
  const raw = readString(value);
  if (raw === null) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  if (isIsoLike(raw)) {
    return raw;
  }
  return raw;
}

function isIsoLike(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function resolveNoteType(fromMatter: NoteType | null, slidesMode: boolean): NoteType {
  if (slidesMode) {
    return 'slides';
  }
  return fromMatter ?? 'doc';
}

function splitSlideChunks(body: string): string[] {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return [''];
  }
  return trimmed.split(/\n---\s*\n/);
}

function renderMarkdownChunk(
  chunk: string,
  sourcePath: string,
  warnings: MarkdownConvertWarning[],
): string {
  const withHtmlBlocks = preprocessEmbeddedHtmlBlocks(chunk, warnings);
  const withTables = preprocessTableColumnAlignment(withHtmlBlocks, warnings);
  const withRemote = preprocessRemoteImages(withTables, warnings);
  const withCallouts = preprocessCallouts(withRemote, warnings);
  const withEmbeds = preprocessWikiEmbeds(withCallouts, sourcePath, warnings);
  return markdownToHtmlFragment(withEmbeds);
}

function preprocessTableColumnAlignment(input: string, warnings: MarkdownConvertWarning[]): string {
  for (const line of input.split('\n')) {
    if (!line.includes('|') || !line.includes(':')) {
      continue;
    }
    if (lineHasGfmColumnAlignment(line)) {
      warnings.push({
        code: 'W_IMPORT_UNSUPPORTED',
        params: { detail: 'table-column-alignment' },
      });
      break;
    }
  }
  return input;
}

function lineHasGfmColumnAlignment(line: string): boolean {
  let index = 0;
  while (index < line.length) {
    const pipe = line.indexOf('|', index);
    if (pipe === -1) {
      return false;
    }
    const nextPipe = line.indexOf('|', pipe + 1);
    if (nextPipe === -1) {
      return false;
    }
    const cell = line.slice(pipe + 1, nextPipe).trim();
    if (cell.length >= 3 && cell.startsWith(':') && cell.endsWith(':') && cell.includes('-')) {
      return true;
    }
    index = pipe + 1;
  }
  return false;
}

function preprocessEmbeddedHtmlBlocks(input: string, warnings: MarkdownConvertWarning[]): string {
  const lower = input.toLowerCase();
  let search = 0;
  while (search < lower.length) {
    const idx = lower.indexOf('<div', search);
    if (idx === -1) {
      break;
    }
    const after = lower.charAt(idx + 4);
    if (after === ' ' || after === '>' || after === '\t' || after === '\n' || after === '\r') {
      warnings.push({ code: 'W_IMPORT_UNSUPPORTED', params: { detail: 'embedded-html-block' } });
      break;
    }
    search = idx + 4;
  }
  return input;
}

function preprocessRemoteImages(input: string, warnings: MarkdownConvertWarning[]): string {
  let result = '';
  let index = 0;
  while (index < input.length) {
    const start = input.indexOf('![', index);
    if (start === -1) {
      result += input.slice(index);
      break;
    }
    result += input.slice(index, start);
    const closeBracket = input.indexOf('](', start + 2);
    if (closeBracket === -1) {
      result += input.slice(start);
      break;
    }
    const urlStart = closeBracket + 2;
    const urlEnd = input.indexOf(')', urlStart);
    if (urlEnd === -1) {
      result += input.slice(start);
      break;
    }
    const url = input.slice(urlStart, urlEnd);
    if (url.startsWith('http://') || url.startsWith('https://')) {
      warnings.push({ code: 'W_IMPORT_UNSUPPORTED', params: { detail: 'remote-image' } });
    }
    result += input.slice(start, urlEnd + 1);
    index = urlEnd + 1;
  }
  return result;
}

function wrapForType(type: NoteType, inner: string): string {
  const trimmed = inner.trim();
  if (trimmed.length === 0) {
    return defaultShell(type);
  }
  if (type === 'slides') {
    return trimmed;
  }
  if (type === 'todo') {
    return trimmed;
  }
  if (trimmed.startsWith('<article')) {
    return trimmed;
  }
  return `<article>\n${trimmed}\n</article>`;
}

function stampImportLossesOnContent(
  body: string,
  warnings: readonly MarkdownConvertWarning[],
): string {
  const tokens = warnings
    .filter((warning) => warning.code === 'W_IMPORT_UNSUPPORTED')
    .map((warning) => warning.params?.detail)
    .filter((detail): detail is string => typeof detail === 'string' && detail.length > 0);
  if (tokens.length === 0) {
    return body;
  }
  const unique = [...new Set(tokens)];
  const marker = ` data-g-import-losses="${escapeAttr(unique.join(','))}"`;
  if (body.includes('<article')) {
    return body.replace(/<article(\s|>)/, `<article${marker}$1`);
  }
  return body;
}

function defaultShell(type: NoteType): string {
  if (type === 'slides') {
    return '<section class="slide"><h2>Sin título</h2></section>';
  }
  if (type === 'todo') {
    return '<ul class="tasks"><li data-g-task id="tarea"><input type="checkbox"> Tarea</li></ul>';
  }
  return '<article><h1>Sin título</h1></article>';
}

function resolveTitle(fromMatter: string | null, body: string, sourcePath: string): string {
  if (fromMatter !== null) {
    return fromMatter;
  }
  const h1 = readFirstH1(body);
  if (h1 !== null) {
    return h1;
  }
  const base = posix.basename(sourcePath);
  return base.replace(/\.md$/i, '');
}

function readFirstH1(html: string): string | null {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (match === null) {
    return null;
  }
  return collapseText(match[1] ?? '');
}

function collapseText(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ParsedCalloutStart {
  readonly rawKind: string;
  readonly fold: '+' | '-' | null;
  readonly titleRest: string;
}

function parseCalloutStartLine(line: string): ParsedCalloutStart | null {
  if (!line.startsWith('> [!')) {
    return null;
  }
  let cursor = 4;
  let rawKind = '';
  while (cursor < line.length) {
    const code = line.charCodeAt(cursor);
    const isLetter =
      (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || line.charAt(cursor) === '-';
    if (!isLetter) {
      break;
    }
    rawKind += line.charAt(cursor);
    cursor += 1;
  }
  if (rawKind.length === 0 || line.charAt(cursor) !== ']') {
    return null;
  }
  cursor += 1;
  let fold: '+' | '-' | null = null;
  const marker = line.charAt(cursor);
  if (marker === '+' || marker === '-') {
    fold = marker;
    cursor += 1;
  }
  while (cursor < line.length && line.charAt(cursor) === ' ') {
    cursor += 1;
  }
  return { rawKind, fold, titleRest: line.slice(cursor) };
}

function preprocessCallouts(input: string, warnings: MarkdownConvertWarning[]): string {
  const lines = input.split('\n');
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const start = parseCalloutStartLine(line);
    if (start === null) {
      out.push(line);
      index += 1;
      continue;
    }
    if (start.fold !== null) {
      warnings.push({ code: 'W_IMPORT_UNSUPPORTED', params: { detail: 'callout-fold' } });
    }
    const kind = mapCalloutKind(start.rawKind, warnings);
    const fragmentLines: string[] = [];
    if (start.titleRest.trim().length > 0) {
      fragmentLines.push(start.titleRest.trim());
    }
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? '';
      if (!next.startsWith('>')) {
        break;
      }
      fragmentLines.push(next.replace(/^>\s?/, ''));
      index += 1;
    }
    const inner = markdownToHtmlFragment(fragmentLines.join('\n\n'));
    const foldAttr = start.fold !== null ? ' data-g-callout-fold=""' : '';
    out.push(
      `<aside class="callout" data-kind="${escapeAttr(kind)}"${foldAttr}>\n${inner}\n</aside>`,
    );
  }
  return out.join('\n');
}

function mapCalloutKind(raw: string, warnings: MarkdownConvertWarning[]): string {
  const key = raw.toLowerCase();
  const mapped = CALLOUT_KIND_MAP[key];
  if (mapped === undefined) {
    warnings.push({ code: 'W_IMPORT_UNSUPPORTED', params: { detail: `callout-${key}` } });
    return 'info';
  }
  if (mapped !== key) {
    warnings.push({ code: 'W_IMPORT_UNSUPPORTED', params: { detail: `callout-kind-${key}` } });
  }
  return mapped;
}

function preprocessWikiEmbeds(
  input: string,
  sourcePath: string,
  warnings: MarkdownConvertWarning[],
): string {
  let result = '';
  let index = 0;
  while (index < input.length) {
    const at = input.indexOf('![[', index);
    if (at === -1) {
      result += input.slice(index);
      break;
    }
    result += input.slice(index, at);
    const close = input.indexOf(']]', at + 3);
    if (close === -1) {
      result += input.slice(at);
      break;
    }
    const target = input.slice(at + 3, close).trim();
    if (/\.md$/i.test(target)) {
      result += `![[${target}]]`;
      warnings.push({ code: 'W_IMPORT_UNSUPPORTED', params: { detail: 'embed-nota' } });
    } else {
      const vaultPath = target.includes('/') ? target : `attachments/${target}`;
      const href = hrefFromVaultRoot(sourcePath, vaultPath);
      const alt = posix.basename(target);
      warnings.push({ code: 'W_IMPORT_UNSUPPORTED', params: { detail: 'wiki-embed' } });
      result += `![${alt}](${href})`;
    }
    index = close + 2;
  }
  return result;
}

function hrefFromVaultRoot(sourcePath: string, vaultRelative: string): string {
  const noteDir = posix.dirname(sourcePath);
  const normalized = posix.normalize(vaultRelative);
  return posix.relative(noteDir, normalized) || posix.basename(normalized);
}

function markdownToHtmlFragment(markdown: string): string {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm, { singleTilde: false })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeGavetaTasks)
    .use(rehypeGavetaMermaid)
    .use(rehypeStringify);
  const file = processor.processSync(markdown);
  return String(file).trim();
}

function rehypeGavetaTasks() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'ul') {
        return;
      }
      const className = readClassName(node);
      if (!className.includes('contains-task-list')) {
        return;
      }
      node.properties.className = ['tasks'];
      for (const child of node.children) {
        if (child.type !== 'element' || child.tagName !== 'li') {
          continue;
        }
        transformTaskItem(child);
      }
    });
  };
}

function transformTaskItem(item: Element): void {
  const className = readClassName(item);
  if (!className.includes('task-list-item')) {
    return;
  }
  item.properties.className = [];
  item.properties.dataGTask = '';
  let checked = false;
  let due: string | null = null;
  const textParts: string[] = [];
  const nextChildren: Element['children'] = [];
  for (const child of item.children) {
    if (child.type === 'element' && child.tagName === 'input') {
      const inputType = readPropertyString(child.properties.type);
      if (inputType === 'checkbox') {
        checked = child.properties.checked === true || child.properties.checked === '';
        continue;
      }
    }
    if (child.type === 'element' && child.tagName === 'ul') {
      nextChildren.push(child);
      continue;
    }
    if (child.type === 'text') {
      const parsed = parseTaskText(child.value);
      if (parsed.due !== null) {
        due = parsed.due;
      }
      if (parsed.text.trim().length > 0) {
        textParts.push(parsed.text.trim());
      }
      continue;
    }
    if (child.type === 'element') {
      const plain = elementPlainText(child);
      const parsed = parseTaskText(plain);
      if (parsed.due !== null) {
        due = parsed.due;
      }
      if (parsed.text.trim().length > 0) {
        nextChildren.push({
          type: 'element',
          tagName: 'span',
          properties: {},
          children: [{ type: 'text', value: parsed.text.trim() }],
        });
      }
      continue;
    }
    nextChildren.push(child);
  }
  const checkbox: Element = {
    type: 'element',
    tagName: 'input',
    properties: {
      type: 'checkbox',
      ...(checked ? { checked: true } : {}),
    },
    children: [],
  };
  const labelText = textParts.join(' ').trim();
  const children: Element['children'] = [checkbox];
  if (labelText.length > 0) {
    const label: HastText = { type: 'text', value: ` ${labelText}` };
    children.push(label);
  }
  children.push(...nextChildren);
  item.children = children;
  if (due !== null) {
    item.properties.dataGDue = due;
  }
}

function parseTaskText(value: string): { text: string; due: string | null } {
  let due: string | null = null;
  let text = value;
  const dueInline = TASK_DUE_INLINE.exec(text);
  if (dueInline !== null) {
    due = normalizeDateToken(dueInline[1] ?? '');
    text = text.replace(TASK_DUE_INLINE, '');
  }
  const completion = TASK_COMPLETION_INLINE.exec(text);
  if (completion !== null) {
    text = text.replace(TASK_COMPLETION_INLINE, '');
  }
  const emojiDue = TASK_DUE_EMOJI.exec(text);
  if (emojiDue !== null) {
    due = emojiDue[1] ?? due;
    text = text.replace(TASK_DUE_EMOJI, '');
  }
  const doneEmoji = TASK_DONE_EMOJI.exec(text);
  if (doneEmoji !== null) {
    text = text.replace(TASK_DONE_EMOJI, '');
  }
  const schedEmoji = TASK_SCHED_EMOJI.exec(text);
  if (schedEmoji !== null) {
    due = schedEmoji[1] ?? due;
    text = text.replace(TASK_SCHED_EMOJI, '');
  }
  return { text: text.replace(/\s+/g, ' ').trim(), due };
}

function normalizeDateToken(token: string): string | null {
  const trimmed = token.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (!Number.isNaN(Date.parse(trimmed))) {
    return trimmed.slice(0, 10);
  }
  return null;
}

function rehypeGavetaMermaid() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || parent === undefined || index === undefined) {
        return;
      }
      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code',
      );
      if (code === undefined) {
        return;
      }
      const language = readLanguageClass(code);
      if (language !== 'mermaid') {
        return;
      }
      const text = elementPlainText(code);
      const replacement: Element = {
        type: 'element',
        tagName: 'pre',
        properties: { className: ['mermaid'] },
        children: [{ type: 'text', value: text }],
      };
      parent.children[index] = replacement;
    });
  };
}

function readLanguageClass(node: Element): string | null {
  const className = readClassName(node);
  for (const token of className) {
    if (token.startsWith('language-')) {
      return token.slice('language-'.length);
    }
  }
  return null;
}

function readClassName(node: Element): string[] {
  const value: unknown = node.properties.className;
  if (Array.isArray(value)) {
    const tokens: string[] = [];
    for (const entry of value) {
      if (typeof entry === 'string' && entry.length > 0) {
        tokens.push(entry);
      }
    }
    return tokens;
  }
  if (typeof value === 'string') {
    const parts = value.split(/\s+/);
    const tokens: string[] = [];
    for (const part of parts) {
      if (part.length > 0) {
        tokens.push(part);
      }
    }
    return tokens;
  }
  return [];
}

function readPropertyString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return String(value[0]);
  }
  return null;
}

function elementPlainText(node: Element): string {
  const parts: string[] = [];
  walkHastText(node, parts);
  return parts.join('');
}

function walkHastText(node: Element, parts: string[]): void {
  for (const child of node.children) {
    if (child.type === 'text') {
      parts.push(child.value);
      continue;
    }
    if (child.type === 'element') {
      walkHastText(child, parts);
    }
  }
}
