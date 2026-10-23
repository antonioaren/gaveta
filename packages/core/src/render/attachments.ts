import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { isProducedHref, resolveVaultHref } from '../links/path.ts';
import { pathOutsideVault } from '../vault/errors.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseElement = DefaultTreeAdapterMap['element'];

/** Vault-relative attachment paths referenced by a note (same rules as export). */
export function collectNoteAttachmentPaths(html: string, notePath: string): readonly string[] {
  const document = parse(html, { scriptingEnabled: false });
  const found = new Set<string>();
  for (const child of document.childNodes) {
    walkTree(child, (element) => {
      const tag = element.tagName;
      if (tag === 'a') {
        addVaultResource(readAttr(element, 'href'), notePath, found);
        return;
      }
      if (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio') {
        addVaultResource(readAttr(element, 'src'), notePath, found);
        if (tag === 'video') {
          addVaultResource(readAttr(element, 'poster'), notePath, found);
        }
      }
    });
  }
  return [...found].sort();
}

export function isBlockedRenderVaultPath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.length === 0) {
    return true;
  }
  if (normalized.startsWith('.gaveta/') || normalized === '.gaveta') {
    return true;
  }
  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment.startsWith('.')) {
      return true;
    }
  }
  if (/\.html$/iu.test(normalized)) {
    return true;
  }
  return false;
}

export function assertNoteAttachmentPathAllowed(
  relativePath: string,
  allowed: ReadonlySet<string>,
): void {
  if (isBlockedRenderVaultPath(relativePath)) {
    throw pathOutsideVault();
  }
  if (!allowed.has(relativePath)) {
    throw pathOutsideVault();
  }
}

function addVaultResource(src: string | null, notePath: string, found: Set<string>): void {
  if (src === null || src.length === 0) {
    return;
  }
  if (!isProducedHref(src)) {
    return;
  }
  const resolved = resolveVaultHref(notePath, src);
  if (resolved === null) {
    if (src.startsWith('#')) {
      return;
    }
    throw pathOutsideVault();
  }
  if (resolved.endsWith('.html') || resolved.endsWith('.md')) {
    return;
  }
  found.add(resolved);
}

function walkTree(node: ParseChild, visit: (element: ParseElement) => void): void {
  if (isElement(node)) {
    visit(node);
  }
  const children = childNodesOf(node);
  for (const child of children) {
    walkTree(child, visit);
  }
}

function childNodesOf(node: ParseChild): readonly ParseChild[] {
  if ('childNodes' in node && Array.isArray(node.childNodes)) {
    return node.childNodes;
  }
  return [];
}

function isElement(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' &&
    node.nodeName !== '#comment' &&
    node.nodeName !== '#document' &&
    'tagName' in node
  );
}

function readAttr(element: ParseElement, name: string): string | null {
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === name) {
      return attr.value;
    }
  }
  return null;
}
