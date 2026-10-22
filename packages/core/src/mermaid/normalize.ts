import type { DefaultTreeAdapterMap } from 'parse5';
import {
  MERMAID_BOOT_BASENAME,
  MERMAID_LIB_ROLE,
  MERMAID_BOOT_ROLE,
  MERMAID_MIN_BASENAME,
  MERMAID_SCRIPT_ATTR,
  isMermaidAssetHref,
} from './assets.ts';

type ParseElement = DefaultTreeAdapterMap['element'];
type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseText = DefaultTreeAdapterMap['textNode'];

export interface NormAttr {
  readonly name: string;
  readonly value: string;
}

export interface NormElement {
  readonly kind: 'element';
  tag: string;
  attrs: NormAttr[];
  children: NormChild[];
  readonly void: boolean;
}

export type NormChild = { readonly kind: 'text'; value: string } | NormElement;

const MERMAID_CLASS = 'mermaid';

/** Strip Mermaid click/link directives that could run `javascript:` URLs. */
export function sanitizeMermaidSource(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^click\s+/i.test(trimmed) && /javascript:/i.test(trimmed)) {
      continue;
    }
    if (/^link\s+/i.test(trimmed) && /javascript:/i.test(trimmed)) {
      continue;
    }
    out.push(line);
  }
  return out.join('\n').trimEnd();
}

export function isMermaidClass(classes: readonly string[]): boolean {
  return classes.includes(MERMAID_CLASS);
}

export function readMermaidSourceFromPre(element: ParseElement): string | null {
  const tag = element.tagName.toLowerCase();
  if (tag !== 'pre') {
    return null;
  }
  const classes = classList(element);
  if (isMermaidClass(classes)) {
    return sanitizeMermaidSource(rawPreText(element.childNodes));
  }
  const code = findChildElement(element, 'code');
  if (code === null) {
    return null;
  }
  const language = readLanguageClass(code);
  if (language !== 'mermaid') {
    return null;
  }
  return sanitizeMermaidSource(rawPreText(code.childNodes));
}

export function readMermaidSourceFromDiv(element: ParseElement): string | null {
  if (element.tagName.toLowerCase() !== 'div') {
    return null;
  }
  if (!isMermaidClass(classList(element))) {
    return null;
  }
  return sanitizeMermaidSource(rawPreText(element.childNodes));
}

export function buildMermaidPre(source: string): NormElement {
  return {
    kind: 'element',
    tag: 'pre',
    attrs: [{ name: 'class', value: MERMAID_CLASS }],
    children: [{ kind: 'text', value: sanitizeMermaidSource(source) }],
    void: false,
  };
}

export function treeContainsMermaid(nodes: readonly NormChild[]): boolean {
  for (const node of nodes) {
    if (node.kind !== 'element') {
      continue;
    }
    if (node.tag === 'pre' && isMermaidClass(classTokens(node.attrs))) {
      return true;
    }
    if (treeContainsMermaid(node.children)) {
      return true;
    }
  }
  return false;
}

export function normalizeMermaidInTree(nodes: readonly NormChild[]): {
  readonly nodes: NormChild[];
  readonly changed: boolean;
} {
  let changed = false;
  const out: NormChild[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      out.push(node);
      continue;
    }
    const converted = convertMermaidElement(node);
    if (converted !== null) {
      out.push(converted);
      changed = true;
      continue;
    }
    const children = normalizeMermaidInTree(node.children);
    if (children.changed) {
      changed = true;
      out.push({ ...node, children: children.nodes });
      continue;
    }
    out.push(node);
  }
  return { nodes: out, changed };
}

function convertMermaidElement(node: NormElement): NormElement | null {
  if (node.tag === 'pre') {
    const classes = classTokens(node.attrs);
    if (isMermaidClass(classes)) {
      const source = sanitizeMermaidSource(concatText(node.children));
      return buildMermaidPre(source);
    }
    const code = node.children.find(
      (child): child is NormElement => child.kind === 'element' && child.tag === 'code',
    );
    if (code !== undefined && readLanguageClassFromAttrs(code.attrs) === 'mermaid') {
      return buildMermaidPre(concatText(code.children));
    }
  }
  if (node.tag === 'div' && isMermaidClass(classTokens(node.attrs))) {
    return buildMermaidPre(concatText(node.children));
  }
  return null;
}

export function isTrustedMermaidScript(element: ParseElement): boolean {
  if (element.tagName.toLowerCase() !== 'script') {
    return false;
  }
  const role = attribute(element, MERMAID_SCRIPT_ATTR);
  if (role !== MERMAID_LIB_ROLE && role !== MERMAID_BOOT_ROLE) {
    return false;
  }
  const src = attribute(element, 'src');
  if (src === null) {
    return false;
  }
  const expected = role === MERMAID_LIB_ROLE ? MERMAID_MIN_BASENAME : MERMAID_BOOT_BASENAME;
  if (!isMermaidAssetHref(src, expected)) {
    return false;
  }
  if (!hasAttribute(element, 'defer')) {
    return false;
  }
  return rawPreText(element.childNodes).trim().length === 0;
}

function readLanguageClassFromAttrs(attrs: readonly NormAttr[]): string | null {
  for (const attr of attrs) {
    if (attr.name !== 'class') {
      continue;
    }
    for (const token of attr.value.split(/\s+/)) {
      if (token.startsWith('language-')) {
        return token.slice('language-'.length);
      }
    }
  }
  return null;
}

function classTokens(attrs: readonly NormAttr[]): string[] {
  const raw = attrs.find((attr) => attr.name === 'class')?.value ?? '';
  return raw.split(/\s+/).filter((token) => token.length > 0);
}

function concatText(children: readonly NormChild[]): string {
  let text = '';
  for (const child of children) {
    if (child.kind === 'text') {
      text += child.value;
    } else {
      text += concatText(child.children);
    }
  }
  return text;
}

function classList(element: ParseElement): string[] {
  const raw = attribute(element, 'class');
  if (raw === null) {
    return [];
  }
  return raw.split(/\s+/).filter((token) => token.length > 0);
}

function readLanguageClass(element: ParseElement): string | null {
  for (const token of classList(element)) {
    if (token.startsWith('language-')) {
      return token.slice('language-'.length);
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

function rawPreText(nodes: readonly ParseChild[]): string {
  let text = '';
  for (const node of nodes) {
    if (isTextNode(node)) {
      text += node.value;
      continue;
    }
    if (!isElementNode(node)) {
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') {
      continue;
    }
    text += rawPreText(node.childNodes);
  }
  return text;
}

function hasAttribute(element: ParseElement, name: string): boolean {
  const target = name.toLowerCase();
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === target) {
      return true;
    }
  }
  return false;
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

function isTextNode(node: ParseChild): node is ParseText {
  return node.nodeName === '#text';
}

function isElementNode(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}
