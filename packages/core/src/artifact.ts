/**
 * Artifact notes wrap interactive Claude HTML in a single sandboxed iframe.
 * Scripts live only inside srcdoc; the outer note stays on the contract.
 */
import { html, parse, serialize } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { GavetaError } from './errors.ts';
import { escapeAttr, escapeText } from './links/path.ts';
import { parseNote } from './parser.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];

export const ARTIFACT_SANDBOX = 'allow-scripts';

export const ARTIFACT_CSP_OFFLINE =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'";

export const ARTIFACT_CSP_CDN =
  "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com; connect-src 'none'";

export const ARTIFACT_CDN_META = 'gaveta:artifact-cdn';

const CSP_HTTP_EQUIV = 'content-security-policy';
const REFRESH_HTTP_EQUIV = 'refresh';

const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdn.tailwindcss.com',
] as const;

export interface BuildArtifactOptions {
  readonly title: string;
  readonly description: string;
  readonly originalHtml: string;
  readonly allowCdn: boolean;
}

export function artifactCsp(allowCdn: boolean): string {
  return allowCdn ? ARTIFACT_CSP_CDN : ARTIFACT_CSP_OFFLINE;
}

/** Entity-encode content for a double-quoted srcdoc attribute. */
export function escapeSrcdoc(value: string): string {
  return escapeAttr(value);
}

export function injectArtifactCsp(sourceHtml: string, csp: string): string {
  let document: ParseDocument;
  try {
    document = parse(sourceHtml, { scriptingEnabled: false });
  } catch {
    throw new GavetaError('E_ARTIFACT_CSP');
  }
  const htmlElement = findChildElement(document, 'html');
  if (htmlElement === null) {
    return wrapBareHtmlWithCsp(sourceHtml, csp);
  }
  let head = findChildElement(htmlElement, 'head');
  if (head === null) {
    head = createHeadElement();
    const body = findChildElement(htmlElement, 'body');
    if (body === null) {
      htmlElement.childNodes.unshift(head);
    } else {
      const bodyIndex = htmlElement.childNodes.indexOf(body);
      htmlElement.childNodes.splice(bodyIndex, 0, head);
    }
    head.parentNode = htmlElement;
  }
  stripCspMetaFromHead(head);
  prependCspMeta(head, csp);
  return serialize(document);
}

export function buildArtifactBody(options: BuildArtifactOptions): string {
  const wrapped = wrapStandaloneHtml(neutralizeArtifactSource(options.originalHtml));
  const srcdoc = injectArtifactCsp(wrapped, artifactCsp(options.allowCdn));
  const title = escapeAttr(options.title);
  const description = escapeText(options.description);
  const iframe = `<iframe sandbox="${ARTIFACT_SANDBOX}" title="${title}" srcdoc="${escapeSrcdoc(srcdoc)}"></iframe>`;
  return `<article>\n  <h1>${escapeText(options.title)}</h1>\n  <section id="descripcion">\n    <p>${description}</p>\n  </section>\n  ${iframe}\n</article>`;
}

function neutralizeArtifactSource(source: string): string {
  return source.replace(/<\/iframe/gi, '&lt;/iframe');
}

function wrapStandaloneHtml(source: string): string {
  const trimmed = source.trim();
  const lower = trimmed.toLowerCase();
  if (lower.includes('<html') && lower.includes('<body')) {
    return trimmed;
  }
  if (lower.includes('<!doctype')) {
    return trimmed;
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>${trimmed}</body></html>`;
}

function wrapBareHtmlWithCsp(fragment: string, csp: string): string {
  const head = createHeadElement();
  prependCspMeta(head, csp);
  const body = createBodyWithHtml(fragment);
  const htmlNode: ParseElement = {
    nodeName: 'html',
    tagName: 'html',
    attrs: [{ name: 'lang', value: 'es' }],
    namespaceURI: html.NS.HTML,
    childNodes: [head, body],
    parentNode: null,
  };
  const document: ParseDocument = {
    nodeName: '#document',
    mode: html.DOCUMENT_MODE.NO_QUIRKS,
    childNodes: [htmlNode],
  };
  htmlNode.parentNode = document;
  head.parentNode = htmlNode;
  body.parentNode = htmlNode;
  linkDescendants(body);
  return serialize(document);
}

function createBodyWithHtml(fragment: string): ParseElement {
  let inner: ParseDocument;
  try {
    inner = parse(fragment, { scriptingEnabled: false });
  } catch {
    throw new GavetaError('E_ARTIFACT_CSP');
  }
  const body: ParseElement = {
    nodeName: 'body',
    tagName: 'body',
    attrs: [],
    namespaceURI: html.NS.HTML,
    childNodes: [...inner.childNodes],
    parentNode: null,
  };
  for (const child of body.childNodes) {
    child.parentNode = body;
    if (isElement(child)) {
      linkDescendants(child);
    }
  }
  return body;
}

function linkDescendants(element: ParseElement): void {
  for (const child of element.childNodes) {
    child.parentNode = element;
    if (isElement(child)) {
      linkDescendants(child);
    }
  }
}

function createHeadElement(): ParseElement {
  return {
    nodeName: 'head',
    tagName: 'head',
    attrs: [],
    namespaceURI: html.NS.HTML,
    childNodes: [],
    parentNode: null,
  };
}

function cspMetaElement(csp: string): ParseElement {
  return {
    nodeName: 'meta',
    tagName: 'meta',
    attrs: [
      { name: 'http-equiv', value: 'Content-Security-Policy' },
      { name: 'content', value: csp },
    ],
    namespaceURI: html.NS.HTML,
    childNodes: [],
    parentNode: null,
  };
}

function prependCspMeta(head: ParseElement, csp: string): void {
  const meta = cspMetaElement(csp);
  meta.parentNode = head;
  head.childNodes.unshift(meta);
}

function stripCspMetaFromHead(head: ParseElement): void {
  head.childNodes = head.childNodes.filter((child) => {
    if (!isElement(child) || child.tagName.toLowerCase() !== 'meta') {
      return true;
    }
    const equiv = attribute(child, 'http-equiv');
    return (equiv?.trim().toLowerCase() ?? '') !== CSP_HTTP_EQUIV;
  });
  for (const child of head.childNodes) {
    child.parentNode = head;
  }
}

export function plainTextFromSrcdoc(srcdoc: string): string {
  const parsed = parseNote(injectArtifactCsp(srcdoc, ARTIFACT_CSP_OFFLINE));
  return parsed.note?.plainText ?? '';
}

export function readArtifactSrcdoc(html: string): string | null {
  let document: ParseDocument;
  try {
    document = parse(html, { scriptingEnabled: false });
  } catch {
    return null;
  }
  const iframe = findFirstIframe(document);
  if (iframe === null) {
    return null;
  }
  return attribute(iframe, 'srcdoc');
}

export function readArtifactAllowCdn(html: string): boolean {
  const match = /<meta\s+name="gaveta:artifact-cdn"\s+content="([^"]*)"/i.exec(html);
  if (match === null) {
    return false;
  }
  const value = match[1]?.trim().toLowerCase() ?? '';
  return value === 'true' || value === '1' || value === 'yes';
}

export function expectedArtifactCsp(html: string): string {
  return artifactCsp(readArtifactAllowCdn(html));
}

export function srcdocContainsCsp(srcdoc: string, csp: string): boolean {
  let document: ParseDocument;
  try {
    document = parse(srcdoc, { scriptingEnabled: false });
  } catch {
    return false;
  }
  const head = locateDocumentHead(document);
  if (head === null) {
    return false;
  }
  const first = firstElementChild(head);
  if (first === null || !isExpectedCspMeta(first, csp)) {
    return false;
  }
  return !srcdocHasForbiddenPolicyMeta(document);
}

function locateDocumentHead(document: ParseDocument): ParseElement | null {
  const htmlElement = findChildElement(document, 'html');
  if (htmlElement === null) {
    return null;
  }
  return findChildElement(htmlElement, 'head');
}

function firstElementChild(parent: ParseElement): ParseElement | null {
  for (const child of parent.childNodes) {
    if (isElement(child)) {
      return child;
    }
  }
  return null;
}

function isExpectedCspMeta(element: ParseElement, expectedCsp: string): boolean {
  if (element.tagName.toLowerCase() !== 'meta') {
    return false;
  }
  const equiv = attribute(element, 'http-equiv');
  if ((equiv?.trim().toLowerCase() ?? '') !== CSP_HTTP_EQUIV) {
    return false;
  }
  const content = attribute(element, 'content');
  return content === expectedCsp;
}

function srcdocHasForbiddenPolicyMeta(document: ParseDocument): boolean {
  let extraCsp = 0;
  let refresh = false;
  walkElements(document, (element) => {
    if (element.tagName.toLowerCase() !== 'meta') {
      return;
    }
    const equiv = attribute(element, 'http-equiv');
    if (equiv === null) {
      return;
    }
    const normalized = equiv.trim().toLowerCase();
    if (normalized === CSP_HTTP_EQUIV) {
      extraCsp += 1;
      return;
    }
    if (normalized === REFRESH_HTTP_EQUIV) {
      refresh = true;
    }
  });
  return extraCsp !== 1 || refresh;
}

function walkElements(document: ParseDocument, visit: (element: ParseElement) => void): void {
  const stack: ParseChild[] = [...document.childNodes];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    if (!isElement(current)) {
      continue;
    }
    visit(current);
    for (const child of current.childNodes) {
      stack.push(child);
    }
  }
}

function findChildElement(parent: ParseElement | ParseDocument, tag: string): ParseElement | null {
  const wanted = tag.toLowerCase();
  for (const child of parent.childNodes) {
    if (isElement(child) && child.tagName.toLowerCase() === wanted) {
      return child;
    }
  }
  return null;
}

export function sourceUsesAllowedCdn(html: string): boolean {
  const lower = html.toLowerCase();
  for (const host of CDN_HOSTS) {
    if (lower.includes(host)) {
      return true;
    }
  }
  return false;
}

function findFirstIframe(document: DefaultTreeAdapterMap['document']): ParseElement | null {
  const stack: DefaultTreeAdapterMap['childNode'][] = [...document.childNodes];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    if (!isElement(current)) {
      continue;
    }
    if (current.tagName.toLowerCase() === 'iframe') {
      return current;
    }
    for (const child of current.childNodes) {
      stack.push(child);
    }
  }
  return null;
}

function isElement(node: DefaultTreeAdapterMap['node']): node is ParseElement {
  return node.nodeName !== '#text' && node.nodeName !== '#comment' && 'tagName' in node;
}

function attribute(element: ParseElement, name: string): string | null {
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === name.toLowerCase()) {
      return attr.value;
    }
  }
  return null;
}
