/**
 * HTML → Markdown conversion for vault export (REQ-MIG-09, REQ-MIG-10).
 * Uses rehype-parse + rehype-remark + remark-stringify (DEC-07) with Gaveta-specific handling.
 */
import { posix } from 'node:path';
import { parse, serialize } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import type { Element as HastElement, Root as HastRoot, Text as HastText } from 'hast';
import { visit } from 'unist-util-visit';
import { stringify as stringifyYaml } from 'yaml';
import { isJavascriptUrl, type NoteType } from '../contract.ts';
import type { WarningCode } from '../errors.ts';
import { escapeAttr } from '../links/path.ts';
import { parseNote } from '../parser.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseText = DefaultTreeAdapterMap['textNode'];
type ParseNode = ParseChild | ParseDocument;

export type HtmlExportLinksMode = 'wiki' | 'relative';

export interface HtmlExportTarget {
  readonly id: string;
  readonly title: string;
  readonly path: string;
}

export interface HtmlToMarkdownOptions {
  readonly links?: HtmlExportLinksMode;
  readonly notePath?: string;
  readonly resolveTarget?: (id: string) => HtmlExportTarget | null;
}

export interface HtmlExportLoss {
  readonly detail: string;
}

export interface HtmlToMarkdownWarning {
  readonly code: WarningCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface HtmlToMarkdownResult {
  readonly markdown: string;
  readonly warnings: readonly HtmlToMarkdownWarning[];
  readonly losses: readonly HtmlExportLoss[];
}

const EXPORT_CALLOUT_KIND: Readonly<Record<string, string>> = {
  note: 'note',
  info: 'info',
  tip: 'tip',
  success: 'success',
  warning: 'warning',
  warn: 'failure',
  danger: 'danger',
};

const UNSUPPORTED_TAGS = new Set(['gaveta-kpi', 'gaveta-chart', 'gaveta-embed', 'iframe']);

interface ConvertContext {
  readonly links: HtmlExportLinksMode;
  readonly notePath: string | null;
  readonly resolveTarget: (id: string) => HtmlExportTarget | null;
  readonly losses: HtmlExportLoss[];
  readonly gavetaLinks: { to: string; rel: string }[];
  readonly gavetaTasks: { id: string; priority: string }[];
}

export function convertHtmlToMarkdown(
  html: string,
  options: HtmlToMarkdownOptions = {},
): HtmlToMarkdownResult {
  const parsed = parseNote(html);
  const metadata = parsed.note?.metadata;
  const noteType = metadata?.type ?? parsed.note?.type ?? 'doc';
  const losses: HtmlExportLoss[] = [];
  const gavetaLinks: { to: string; rel: string }[] = [];
  const gavetaTasks: { id: string; priority: string }[] = [];
  const ctx: ConvertContext = {
    links: options.links ?? 'wiki',
    notePath: options.notePath ?? null,
    resolveTarget: options.resolveTarget ?? (() => null),
    losses,
    gavetaLinks,
    gavetaTasks,
  };

  const document = parse(html, { scriptingEnabled: false });
  const body = findFirstElement(document, 'body');
  const bodyChildren = body?.childNodes ?? [];

  let bodyMarkdown: string;
  if (noteType === 'slides') {
    bodyMarkdown = exportSlides(bodyChildren, ctx);
  } else {
    bodyMarkdown = exportBlocks(bodyChildren, ctx);
  }

  const frontMatter = buildFrontMatter({
    title: metadata?.title ?? parsed.note?.title ?? null,
    tags: metadata?.tags ?? [],
    aliases: metadata?.aliases ?? [],
    created: metadata?.created ?? null,
    type: noteType,
    rawType: metadata?.rawType ?? null,
    gavetaLinks,
    gavetaTasks,
  });

  const markdown = `${frontMatter}\n${restoreWikilinks(bodyMarkdown).trim()}\n`;
  const warnings: HtmlToMarkdownWarning[] = [];
  if (losses.length > 0 || gavetaLinks.length > 0 || gavetaTasks.length > 0) {
    warnings.push({
      code: 'W_EXPORT_LOSSY',
      params: { count: losses.length + gavetaLinks.length + gavetaTasks.length },
    });
  }

  return { markdown, warnings, losses };
}

interface FrontMatterInput {
  readonly title: string | null;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly created: string | null;
  readonly type: NoteType;
  readonly rawType: string | null;
  readonly gavetaLinks: readonly { to: string; rel: string }[];
  readonly gavetaTasks: readonly { id: string; priority: string }[];
}

function buildFrontMatter(input: FrontMatterInput): string {
  const record: Record<string, unknown> = {};
  if (input.title !== null && input.title.trim().length > 0) {
    record.title = input.title.trim();
  }
  if (input.tags.length > 0) {
    record.tags = [...input.tags];
  }
  if (input.aliases.length > 0) {
    record.aliases = [...input.aliases];
  }
  if (input.created !== null && input.created.trim().length > 0) {
    record.created = formatCreatedForFrontMatter(input.created);
  }
  if (input.type === 'slides') {
    record.marp = true;
    record.type = 'slides';
  } else if (input.rawType !== null && input.rawType.length > 0) {
    record.type = input.rawType;
  } else if (input.type !== 'doc') {
    record.type = input.type;
  }
  if (input.gavetaLinks.length > 0 || input.gavetaTasks.length > 0) {
    const gaveta: Record<string, unknown> = {};
    if (input.gavetaLinks.length > 0) {
      gaveta.links = input.gavetaLinks.map((entry) => ({ to: entry.to, rel: entry.rel }));
    }
    if (input.gavetaTasks.length > 0) {
      gaveta.tasks = input.gavetaTasks.map((entry) => ({
        id: entry.id,
        priority: entry.priority,
      }));
    }
    record.gaveta = gaveta;
  }
  if (Object.keys(record).length === 0) {
    return '';
  }
  const yamlBody = stringifyYaml(record).trimEnd();
  return `---\n${yamlBody}\n---\n`;
}

function restoreWikilinks(markdown: string): string {
  return markdown.replace(/\\([[[\]|()])/g, '$1');
}

function formatCreatedForFrontMatter(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return value.slice(0, 10);
  }
  return value;
}

function exportSlides(children: readonly ParseChild[], ctx: ConvertContext): string {
  const slides: string[] = [];
  for (const child of children) {
    if (!isElementNode(child)) {
      continue;
    }
    if (child.tagName === 'section' && classIncludes(child, 'slide')) {
      slides.push(exportBlocks(child.childNodes, ctx));
      continue;
    }
    if (child.tagName === 'article') {
      slides.push(exportBlocks(child.childNodes, ctx));
    }
  }
  if (slides.length === 0) {
    return exportBlocks(children, ctx);
  }
  return slides.join('\n---\n');
}

function exportBlocks(children: readonly ParseChild[], ctx: ConvertContext): string {
  const parts: string[] = [];
  for (const child of children) {
    if (!isElementNode(child) && !isTextNode(child)) {
      continue;
    }
    if (isTextNode(child)) {
      const trimmed = child.value.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
      continue;
    }
    const element = child;
    if (element.tagName === 'article') {
      if (classIncludes(element, 'g-dashboard')) {
        parts.push(embedLossyHtml(element, ctx));
      } else {
        parts.push(exportBlocks(element.childNodes, ctx));
      }
      continue;
    }
    if (element.tagName === 'aside' && classIncludes(element, 'callout')) {
      parts.push(calloutToMarkdown(element));
      continue;
    }
    if (element.tagName === 'ul' && classIncludes(element, 'tasks')) {
      parts.push(tasksToMarkdown(element, ctx));
      continue;
    }
    if (element.tagName === 'pre' && classIncludes(element, 'mermaid')) {
      parts.push(mermaidToMarkdown(element));
      continue;
    }
    if (element.tagName === 'section' && classIncludes(element, 'slide')) {
      parts.push(exportBlocks(element.childNodes, ctx));
      continue;
    }
    if (isLossyBlock(element)) {
      parts.push(embedLossyHtml(element, ctx));
      continue;
    }
    parts.push(genericHtmlToMarkdown(serializeOuter(element), ctx));
  }
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n\n');
}

function isLossyBlock(element: ParseElement): boolean {
  if (UNSUPPORTED_TAGS.has(element.tagName)) {
    return true;
  }
  if (element.tagName === 'iframe') {
    return true;
  }
  if (element.tagName === 'section' && classIncludes(element, 'g-frame')) {
    return true;
  }
  if (element.tagName === 'article' && classIncludes(element, 'g-dashboard')) {
    return true;
  }
  return false;
}

function embedLossyHtml(element: ParseElement, ctx: ConvertContext): string {
  const serialized = sanitizeEmbeddedHtml(serializeOuter(element));
  ctx.losses.push({ detail: `embedded-html:${element.tagName}` });
  return serialized;
}

function sanitizeEmbeddedHtml(fragment: string): string {
  const document = parse(fragment, { scriptingEnabled: false });
  for (const child of document.childNodes) {
    stripUnsafeNodes(child);
  }
  return serialize(document).trim();
}

function stripUnsafeNodes(node: ParseChild): void {
  if (!isElementNode(node)) {
    return;
  }
  node.attrs = node.attrs.filter((attr) => !attr.name.toLowerCase().startsWith('on'));
  for (const attr of node.attrs) {
    if (attr.name.toLowerCase() === 'href' && isJavascriptUrl(attr.value)) {
      attr.value = '#';
    }
  }
  const nextChildren: ParseChild[] = [];
  for (const child of node.childNodes) {
    if (isElementNode(child) && child.tagName === 'script') {
      continue;
    }
    stripUnsafeNodes(child);
    nextChildren.push(child);
  }
  node.childNodes = nextChildren;
}

function calloutToMarkdown(element: ParseElement): string {
  const kind = readAttr(element, 'data-kind') ?? 'info';
  const obsidianKind = EXPORT_CALLOUT_KIND[kind] ?? 'info';
  const bodyText = elementPlainText(element).trim();
  const lines = bodyText.split('\n');
  const title = lines[0]?.trim() ?? '';
  const bodyLines = lines
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const out: string[] = [];
  if (title.length > 0) {
    out.push(`> [!${obsidianKind}] ${title}`);
  } else {
    out.push(`> [!${obsidianKind}]`);
  }
  for (const line of bodyLines) {
    out.push(`> ${line}`);
  }
  return out.join('\n');
}

function tasksToMarkdown(element: ParseElement, ctx: ConvertContext): string {
  const lines: string[] = [];
  for (const child of element.childNodes) {
    if (!isElementNode(child) || child.tagName !== 'li') {
      continue;
    }
    lines.push(taskItemToMarkdown(child, 0, ctx));
  }
  return lines.join('\n');
}

function taskItemToMarkdown(item: ParseElement, depth: number, ctx: ConvertContext): string {
  const indent = '  '.repeat(depth);
  const checked = taskIsChecked(item);
  const due = readAttr(item, 'data-g-due');
  const priority = readAttr(item, 'data-g-priority');
  const taskId = readAttr(item, 'id');
  if (priority !== null && taskId !== null) {
    ctx.gavetaTasks.push({ id: taskId, priority });
  }
  const label = taskLabelText(item);
  let suffix = '';
  if (due !== null) {
    suffix = ` 📅 ${due}`;
  }
  const marker = checked ? '- [x]' : '- [ ]';
  const line = `${indent}${marker} ${label}${suffix}`.trimEnd();
  const nested: string[] = [line];
  for (const child of item.childNodes) {
    if (isElementNode(child) && child.tagName === 'ul') {
      for (const li of child.childNodes) {
        if (isElementNode(li) && li.tagName === 'li') {
          nested.push(taskItemToMarkdown(li, depth + 1, ctx));
        }
      }
    }
  }
  return nested.join('\n');
}

function taskIsChecked(item: ParseElement): boolean {
  for (const child of item.childNodes) {
    if (isElementNode(child) && child.tagName === 'input') {
      const type = readAttr(child, 'type');
      if (type === 'checkbox') {
        return readAttr(child, 'checked') !== null;
      }
    }
  }
  return false;
}

function taskLabelText(item: ParseElement): string {
  const parts: string[] = [];
  for (const child of item.childNodes) {
    if (isElementNode(child) && child.tagName === 'input') {
      continue;
    }
    if (isElementNode(child) && child.tagName === 'ul') {
      continue;
    }
    if (isTextNode(child)) {
      parts.push(child.value);
      continue;
    }
    if (isElementNode(child)) {
      parts.push(elementPlainText(child));
    }
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function mermaidToMarkdown(element: ParseElement): string {
  const code = elementPlainText(element).trim();
  return `\`\`\`mermaid\n${code}\n\`\`\``;
}

function genericHtmlToMarkdown(fragment: string, ctx: ConvertContext): string {
  /* eslint-disable @typescript-eslint/no-unsafe-argument -- unified plugin typings */
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeExportLinks, ctx)
    .use(rehypeRemark)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkStringify, {
      bullet: '-',
      emphasis: '*',
      strong: '*',
      fences: true,
      rule: '-',
      setext: false,
    });
  /* eslint-enable @typescript-eslint/no-unsafe-argument */
  const file = processor.processSync(fragment);
  return String(file).trim();
}

function rehypeExportLinks(ctx: ConvertContext) {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: HastElement, index, parent) => {
      if (node.tagName !== 'a' || parent === undefined || index === undefined) {
        return;
      }
      const replacement = anchorToMarkdownText(node, ctx);
      if (replacement === null) {
        return;
      }
      const text: HastText = { type: 'text', value: replacement };
      parent.children[index] = text;
    });
  };
}

function anchorToMarkdownText(node: HastElement, ctx: ConvertContext): string | null {
  const pending = readHastAttr(node, 'data-g-pending');
  if (pending !== null) {
    const label = elementPlainTextHast(node).trim();
    if (label.length > 0 && label !== pending) {
      return `[[${pending}|${label}]]`;
    }
    return `[[${pending}]]`;
  }
  const targetId = readHastAttr(node, 'data-g-to');
  const href = readHastAttr(node, 'href');
  const rel = readHastAttr(node, 'rel');
  const label = elementPlainTextHast(node).trim();
  if (targetId !== null && rel !== null && rel.length > 0) {
    ctx.gavetaLinks.push({ to: targetId, rel });
  }
  if (targetId !== null) {
    const target = ctx.resolveTarget(targetId);
    const section = readSectionFromHref(href);
    if (ctx.links === 'wiki') {
      const title = target?.title ?? label;
      return formatWikilink(title, label, section);
    }
    if (target !== null && ctx.notePath !== null) {
      const relative = htmlPathToMdRelative(ctx.notePath, target.path);
      const url = section === null ? relative : `${relative}#${section}`;
      return `[${label}](${url})`;
    }
    if (href !== null && !isJavascriptUrl(href)) {
      return `[${label}](${htmlHrefToMd(href)})`;
    }
    return label;
  }
  if (href !== null) {
    if (isJavascriptUrl(href)) {
      return label;
    }
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return `[${label}](${href})`;
    }
    return `[${label}](${htmlHrefToMd(href)})`;
  }
  return null;
}

function formatWikilink(title: string, label: string, section: string | null): string {
  const base = section === null ? title : `${title}#${section}`;
  if (label.length > 0 && label !== title && label !== base) {
    return `[[${base}|${label}]]`;
  }
  return `[[${base}]]`;
}

function readSectionFromHref(href: string | null): string | null {
  if (href === null) {
    return null;
  }
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) {
    return null;
  }
  const fragment = href.slice(hashIndex + 1).trim();
  return fragment.length > 0 ? fragment : null;
}

function htmlPathToMdRelative(fromHtml: string, toHtml: string): string {
  const fromDir = posix.dirname(fromHtml);
  const relative = posix.relative(fromDir, toHtml);
  return relative.replace(/\.html$/i, '.md');
}

function htmlHrefToMd(href: string): string {
  if (href.endsWith('.html')) {
    return href.replace(/\.html$/i, '.md');
  }
  return href;
}

function readHastAttr(node: HastElement, name: string): string | null {
  const props = node.properties;
  const camel = name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
  const raw = props[name] ?? props[camel];
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return String(raw[0]);
  }
  return null;
}

function elementPlainTextHast(node: HastElement): string {
  const parts: string[] = [];
  walkHast(node, parts);
  return parts.join('');
}

function walkHast(node: HastElement, parts: string[]): void {
  for (const child of node.children) {
    if (child.type === 'text') {
      parts.push(child.value);
      continue;
    }
    if (child.type === 'element') {
      walkHast(child, parts);
    }
  }
}

function findFirstElement(node: ParseNode, tagName: string): ParseElement | null {
  if (isElementNode(node as ParseChild)) {
    const element = node as ParseElement;
    if (element.tagName === tagName) {
      return element;
    }
  }
  const children = childNodesOf(node);
  for (const child of children) {
    const found = findFirstElement(child, tagName);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function serializeOuter(element: ParseElement): string {
  const attrs = element.attrs.map((attr) => ` ${attr.name}="${escapeAttr(attr.value)}"`).join('');
  return `<${element.tagName}${attrs}>${serialize(element)}</${element.tagName}>`;
}

function childNodesOf(node: ParseNode): readonly ParseChild[] {
  if ('childNodes' in node && Array.isArray(node.childNodes)) {
    return node.childNodes;
  }
  return [];
}

function isElementNode(node: ParseChild): node is ParseElement {
  return node.nodeName !== '#text' && node.nodeName !== '#comment' && 'tagName' in node;
}

function isTextNode(node: ParseChild): node is ParseText {
  return node.nodeName === '#text';
}

function classIncludes(element: ParseElement, className: string): boolean {
  const value = readAttr(element, 'class');
  if (value === null) {
    return false;
  }
  return value.split(/\s+/).includes(className);
}

function readAttr(element: ParseElement, name: string): string | null {
  for (const attr of element.attrs) {
    if (attr.name === name) {
      return attr.value;
    }
  }
  return null;
}

function elementPlainText(element: ParseElement): string {
  const parts: string[] = [];
  walkParseText(element, parts);
  return parts.join('');
}

function walkParseText(node: ParseChild, parts: string[]): void {
  if (isTextNode(node)) {
    parts.push(node.value);
    return;
  }
  if (!isElementNode(node)) {
    return;
  }
  if (node.tagName === 'br') {
    parts.push('\n');
    return;
  }
  for (const child of node.childNodes) {
    walkParseText(child, parts);
  }
}
