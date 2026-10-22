/**
 * Converts standalone Claude-style HTML into Gaveta note bodies.
 */
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { buildArtifactBody, sourceUsesAllowedCdn } from '../artifact.ts';
import { isAllowedBodyElement, isNoteType, slugify, type NoteType } from '../contract.ts';
import type { WarningCode } from '../errors.ts';
import { escapeText } from '../links/path.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseText = DefaultTreeAdapterMap['textNode'];

export interface ClaudeConvertWarning {
  readonly code: WarningCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface ClaudeConvertOptions {
  readonly as?: NoteType;
  readonly allowCdn?: boolean;
  readonly title?: string;
}

export interface ClaudeConvertResult {
  readonly type: NoteType;
  readonly body: string;
  readonly title: string;
  readonly description: string;
  readonly allowCdn: boolean;
  readonly warnings: readonly ClaudeConvertWarning[];
}

const BLOCK_TAGS = new Set([
  'article',
  'section',
  'p',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'pre',
  'blockquote',
  'figure',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'aside',
  'hr',
  'gaveta-kpi',
  'gaveta-chart',
]);

const INLINE_TAGS = new Set([
  'a',
  'strong',
  'em',
  'code',
  'span',
  'small',
  'abbr',
  'time',
  'mark',
  'sub',
  'sup',
  'kbd',
  'br',
  'input',
]);

export function convertClaudeHtml(
  source: string,
  options: ClaudeConvertOptions = {},
): ClaudeConvertResult {
  const warnings: ClaudeConvertWarning[] = [];
  const title = options.title ?? readTitle(source) ?? 'Sin título';
  const forced = options.as;
  const hasScript = containsTag(source, 'script');
  const inferred = forced ?? inferClaudeType(source, hasScript);
  const allowCdn =
    options.allowCdn === true || (inferred === 'artifact' && sourceUsesAllowedCdn(source));

  if (inferred === 'artifact') {
    const description = readDescription(source) ?? `Artefacto importado: ${title}`;
    return {
      type: 'artifact',
      body: buildArtifactBody({
        title,
        description,
        originalHtml: source,
        allowCdn,
      }),
      title,
      description,
      allowCdn,
      warnings: scriptWarnings(hasScript, warnings),
    };
  }

  let document: ParseDocument;
  try {
    document = parse(source, { scriptingEnabled: false });
  } catch {
    throw new Error('invalid claude html');
  }
  const body = findBody(document);
  const nodes = body === null ? [] : body.childNodes;
  const converted = convertChildren(nodes, inferred, warnings);
  const wrapped = wrapByType(inferred, title, converted);
  return {
    type: inferred,
    body: wrapped,
    title,
    description: readDescription(source) ?? title,
    allowCdn: false,
    warnings: scriptWarnings(hasScript, warnings),
  };
}

function scriptWarnings(
  hasScript: boolean,
  warnings: ClaudeConvertWarning[],
): ClaudeConvertWarning[] {
  if (hasScript) {
    warnings.push({ code: 'W_CLAUDE_DROPPED', params: { detail: 'scripts' } });
  }
  return warnings;
}

function inferClaudeType(source: string, hasScript: boolean): NoteType {
  const lower = source.toLowerCase();
  if (
    lower.includes('class="slide') ||
    lower.includes("class='slide") ||
    lower.includes('data-slide') ||
    countMatches(lower, 'class="slide') >= 2
  ) {
    return 'slides';
  }
  if (
    lower.includes('g-frame') ||
    lower.includes('mockup') ||
    lower.includes('wireframe') ||
    lower.includes('prototype')
  ) {
    return 'design';
  }
  if (
    lower.includes('chart.js') ||
    lower.includes('<canvas') ||
    lower.includes('dashboard') ||
    lower.includes('kpi') ||
    lower.includes('metric-card')
  ) {
    return 'dashboard';
  }
  if (hasScript && needsArtifactRuntime(lower)) {
    return 'artifact';
  }
  return 'doc';
}

function needsArtifactRuntime(lower: string): boolean {
  if (lower.includes('react') || lower.includes('createelement') || lower.includes('usestate')) {
    return true;
  }
  if (lower.includes('vue') || lower.includes('svelte')) {
    return true;
  }
  return false;
}

function wrapByType(type: NoteType, title: string, inner: string): string {
  const heading = escapeText(title);
  if (type === 'slides') {
    return inner.trim().length > 0 ? inner : `<section class="slide"><h1>${heading}</h1></section>`;
  }
  if (type === 'dashboard') {
    const body =
      inner.trim().length > 0 ? inner : `<gaveta-kpi class="g-kpi" data-label="KPI">—</gaveta-kpi>`;
    return `<article class="g-dashboard">\n  <h1>${heading}</h1>\n${body}\n</article>`;
  }
  if (type === 'design') {
    const body =
      inner.trim().length > 0
        ? inner
        : `<section class="g-frame" data-device="desktop" id="pantalla"><h2>${heading}</h2></section>`;
    return body;
  }
  const body =
    inner.trim().length > 0
      ? inner
      : `<section id="introduccion"><h2>Introducción</h2><p></p></section>`;
  return `<article>\n  <h1>${heading}</h1>\n${body}\n</article>`;
}

function convertChildren(
  nodes: readonly ParseChild[],
  type: NoteType,
  warnings: ClaudeConvertWarning[],
): string {
  const parts: string[] = [];
  for (const node of nodes) {
    const piece = convertNode(node, type, warnings);
    if (piece.length > 0) {
      parts.push(piece);
    }
  }
  return parts.join('\n');
}

function convertNode(node: ParseChild, type: NoteType, warnings: ClaudeConvertWarning[]): string {
  if (isTextNode(node)) {
    const text = node.value;
    return text.trim().length === 0 ? '' : escapeText(text);
  }
  if (!isElement(node)) {
    return '';
  }
  const tag = node.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'head') {
    warnings.push({ code: 'W_CLAUDE_DROPPED', params: { detail: tag } });
    return '';
  }
  if (tag === 'html' || tag === 'body') {
    return convertChildren(node.childNodes, type, warnings);
  }
  if (type === 'slides' && (tag === 'div' || tag === 'section')) {
    const classes = classList(node);
    if (classes.some((name) => name.includes('slide'))) {
      const inner = convertChildren(node.childNodes, type, warnings);
      const id = readId(node);
      const idAttr = id === null ? '' : ` id="${escapeAttr(id)}"`;
      return `<section class="slide"${idAttr}>\n${inner}\n</section>`;
    }
  }
  if (type === 'design' && (tag === 'div' || tag === 'section')) {
    const classes = classList(node);
    const device = attribute(node, 'data-device') ?? guessDevice(classes);
    if (classes.some((name) => name.includes('frame') || name.includes('screen'))) {
      const inner = convertChildren(node.childNodes, type, warnings);
      const id = readId(node) ?? slugify(readHeadingText(node) ?? 'pantalla');
      return `<section class="g-frame" data-device="${escapeAttr(device)}" id="${escapeAttr(id)}">\n${inner}\n</section>`;
    }
  }
  if (type === 'dashboard') {
    const mapped = mapDashboardNode(node, warnings);
    if (mapped !== null) {
      return mapped;
    }
  }
  if (tag === 'div' && classList(node).includes('mermaid')) {
    const text = preText(node.childNodes).replace(/^\n+|\n+$/g, '');
    return `<pre class="mermaid">${escapeText(text)}</pre>`;
  }
  if (type === 'doc' && (tag === 'h1' || tag === 'h2' || tag === 'h3')) {
    return convertHeadingSection(node, tag, warnings);
  }
  if (!isAllowedBodyElement(tag) && !BLOCK_TAGS.has(tag) && !INLINE_TAGS.has(tag)) {
    if (tag === 'div' || tag === 'span') {
      return convertChildren(node.childNodes, type, warnings);
    }
    warnings.push({ code: 'W_CLAUDE_DROPPED', params: { detail: tag } });
    return convertChildren(node.childNodes, type, warnings);
  }
  return serializeAllowed(node, type, warnings);
}

function mapDashboardNode(node: ParseElement, warnings: ClaudeConvertWarning[]): string | null {
  const tag = node.tagName.toLowerCase();
  const classes = classList(node);
  if (
    tag === 'div' &&
    classes.some((name) => name.includes('kpi') || name.includes('metric') || name.includes('card'))
  ) {
    const label = attribute(node, 'data-label') ?? readHeadingText(node) ?? 'KPI';
    const value = collapseText(node) || '—';
    return `<gaveta-kpi class="g-kpi" data-label="${escapeAttr(label)}">${escapeText(value)}</gaveta-kpi>`;
  }
  if (tag === 'canvas' || classes.some((name) => name.includes('chart'))) {
    const table = `<table>\n  <thead><tr><th>Categoría</th><th>Valor</th></tr></thead>\n  <tbody><tr><td>A</td><td>1</td></tr></tbody>\n</table>`;
    warnings.push({ code: 'W_CLAUDE_DROPPED', params: { detail: 'chart-runtime' } });
    return `<gaveta-chart type="bar">\n${table}\n</gaveta-chart>`;
  }
  return null;
}

function convertHeadingSection(
  node: ParseElement,
  tag: string,
  warnings: ClaudeConvertWarning[],
): string {
  const level = Number(tag.slice(1));
  if (level === 1) {
    return '';
  }
  const text = readHeadingText(node) ?? '';
  const id = slugify(text);
  const inner = convertChildren(node.childNodes, 'doc', warnings);
  return `<section id="${escapeAttr(id)}">\n  <${tag}>${escapeText(text)}</${tag}>\n${inner}\n</section>`;
}

function serializeAllowed(
  node: ParseElement,
  type: NoteType,
  warnings: ClaudeConvertWarning[],
): string {
  const tag = node.tagName.toLowerCase();
  if (tag === 'img') {
    warnings.push({ code: 'W_REMOTE_RESOURCE', params: { element: 'img', attribute: 'src' } });
  }
  const attrs = allowedAttributes(node);
  const open = attrs.length === 0 ? `<${tag}>` : `<${tag} ${attrs.join(' ')}>`;
  const children = convertChildren(node.childNodes, type, warnings);
  if (INLINE_TAGS.has(tag)) {
    return `${open}${children}</${tag}>`;
  }
  return `${open}\n${children}\n</${tag}>`;
}

function allowedAttributes(node: ParseElement): string[] {
  const tag = node.tagName.toLowerCase();
  const out: string[] = [];
  for (const attr of node.attrs) {
    const name = attr.name.toLowerCase();
    if (name === 'style' || name.startsWith('on')) {
      continue;
    }
    if (name === 'class') {
      const kept = classList(node).filter((value) => isAllowedClassName(tag, value));
      if (kept.length > 0) {
        out.push(`class="${escapeAttr(kept.join(' '))}"`);
      }
      continue;
    }
    if (
      name === 'id' ||
      name === 'href' ||
      name === 'alt' ||
      name === 'type' ||
      name === 'data-label'
    ) {
      out.push(`${name}="${escapeAttr(attr.value)}"`);
    }
  }
  return out;
}

function isAllowedClassName(tag: string, className: string): boolean {
  if (
    className === 'slide' ||
    className === 'g-frame' ||
    className === 'g-dashboard' ||
    className === 'g-kpi'
  ) {
    return true;
  }
  if (tag === 'pre' && className.startsWith('language-')) {
    return true;
  }
  return (
    className === 'callout' ||
    className === 'notes' ||
    className === 'tasks' ||
    className === 'mermaid'
  );
}

function readTitle(source: string): string | null {
  const document = parseClaudeDocument(source);
  if (document === null) {
    return null;
  }
  const fromHead = readHeadTitle(document);
  if (fromHead !== null) {
    return fromHead;
  }
  const body = findBody(document);
  if (body === null) {
    return null;
  }
  const h1 = findFirstElementByTag(body, 'h1');
  if (h1 === null) {
    return null;
  }
  const heading = collapseText(h1);
  return heading.length > 0 ? heading : null;
}

function readDescription(source: string): string | null {
  const document = parseClaudeDocument(source);
  if (document === null) {
    return null;
  }
  const fromMeta = readMetaDescription(document);
  if (fromMeta !== null) {
    return fromMeta;
  }
  const body = findBody(document);
  if (body === null) {
    return null;
  }
  const paragraph = findFirstElementByTag(body, 'p');
  if (paragraph === null) {
    return null;
  }
  const text = collapseText(paragraph);
  return text.length > 0 ? text : null;
}

function parseClaudeDocument(source: string): ParseDocument | null {
  try {
    return parse(source, { scriptingEnabled: false });
  } catch {
    return null;
  }
}

function readHeadTitle(document: ParseDocument): string | null {
  const head = findHead(document);
  if (head === null) {
    return null;
  }
  const title = findFirstElementByTag(head, 'title');
  if (title === null) {
    return null;
  }
  const text = collapseText(title);
  return text.length > 0 ? text : null;
}

function readMetaDescription(document: ParseDocument): string | null {
  const head = findHead(document);
  if (head === null) {
    return null;
  }
  for (const child of head.childNodes) {
    if (!isElement(child) || child.tagName.toLowerCase() !== 'meta') {
      continue;
    }
    const name = attribute(child, 'name');
    if (name?.trim().toLowerCase() !== 'description') {
      continue;
    }
    const content = attribute(child, 'content')?.trim() ?? '';
    return content.length > 0 ? content : null;
  }
  return null;
}

function findHead(document: ParseDocument): ParseElement | null {
  const stack: ParseChild[] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || !isElement(node)) {
      continue;
    }
    if (node.tagName.toLowerCase() === 'head') {
      return node;
    }
    for (const child of node.childNodes) {
      stack.push(child);
    }
  }
  return null;
}

function findFirstElementByTag(root: ParseElement, tag: string): ParseElement | null {
  const wanted = tag.toLowerCase();
  const stack: ParseChild[] = [...root.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || !isElement(node)) {
      continue;
    }
    if (node.tagName.toLowerCase() === wanted) {
      return node;
    }
    for (const child of node.childNodes) {
      stack.push(child);
    }
  }
  return null;
}

function containsTag(source: string, tag: string): boolean {
  const lower = source.toLowerCase();
  const open = `<${tag}`;
  let index = 0;
  while (index < lower.length) {
    const at = lower.indexOf(open, index);
    if (at === -1) {
      return false;
    }
    const next = lower.charAt(at + open.length);
    if (next === '>' || next === ' ' || next === '/') {
      return true;
    }
    index = at + open.length;
  }
  return false;
}

function countMatches(haystack: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (index < haystack.length) {
    const at = haystack.indexOf(needle, index);
    if (at === -1) {
      return count;
    }
    count += 1;
    index = at + needle.length;
  }
  return count;
}

function findBody(document: ParseDocument): ParseElement | null {
  const stack: ParseChild[] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || !isElement(node)) {
      continue;
    }
    if (node.tagName.toLowerCase() === 'body') {
      return node;
    }
    for (const child of node.childNodes) {
      stack.push(child);
    }
  }
  return null;
}

function classList(element: ParseElement): string[] {
  const raw = attribute(element, 'class');
  if (raw === null) {
    return [];
  }
  return raw.split(/\s+/).filter((part) => part.length > 0);
}

function attribute(element: ParseElement, name: string): string | null {
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === name.toLowerCase()) {
      return attr.value;
    }
  }
  return null;
}

function readId(element: ParseElement): string | null {
  const id = attribute(element, 'id');
  return id === null || id.trim().length === 0 ? null : id.trim();
}

function readHeadingText(element: ParseElement): string | null {
  for (const child of element.childNodes) {
    if (!isElement(child)) {
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      return collapseText(child);
    }
  }
  return collapseText(element);
}

function collapseText(element: ParseElement): string {
  const parts: string[] = [];
  walkText(element.childNodes, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function walkText(nodes: readonly ParseChild[], parts: string[]): void {
  for (const node of nodes) {
    if (isTextNode(node)) {
      const trimmed = node.value.replace(/\s+/g, ' ').trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
      continue;
    }
    if (isElement(node)) {
      walkText(node.childNodes, parts);
    }
  }
}

function guessDevice(classes: readonly string[]): string {
  if (classes.some((name) => name.includes('mobile') || name.includes('phone'))) {
    return 'mobile';
  }
  if (classes.some((name) => name.includes('tablet'))) {
    return 'tablet';
  }
  return 'desktop';
}

function preText(nodes: readonly ParseChild[]): string {
  let text = '';
  for (const node of nodes) {
    if (isTextNode(node)) {
      text += node.value;
      continue;
    }
    if (isElement(node)) {
      text += preText(node.childNodes);
    }
  }
  return text;
}

function isElement(node: ParseChild): node is ParseElement {
  return node.nodeName !== '#text' && node.nodeName !== '#comment' && 'tagName' in node;
}

function isTextNode(node: ParseChild): node is ParseText {
  return node.nodeName === '#text';
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function isClaudeSourceFlag(value: string | undefined): boolean {
  return value === 'claude';
}

export function assertClaudeTargetType(value: string | undefined): NoteType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isNoteType(value)) {
    throw new Error('invalid as type');
  }
  return value;
}
