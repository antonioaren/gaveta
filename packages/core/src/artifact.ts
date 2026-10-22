/**
 * Artifact notes wrap interactive Claude HTML in a single sandboxed iframe.
 * Scripts live only inside srcdoc; the outer note stays on the contract.
 */
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { escapeAttr, escapeText } from './links/path.ts';
import { parseNote } from './parser.ts';

type ParseElement = DefaultTreeAdapterMap['element'];

export const ARTIFACT_SANDBOX = 'allow-scripts';

export const ARTIFACT_CSP_OFFLINE =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'";

export const ARTIFACT_CSP_CDN =
  "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com; connect-src 'none'";

export const ARTIFACT_CDN_META = 'gaveta:artifact-cdn';

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

export function injectArtifactCsp(html: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">`;
  const lower = html.toLowerCase();
  const headOpen = lower.indexOf('<head');
  if (headOpen === -1) {
    const bodyOpen = lower.indexOf('<body');
    if (bodyOpen === -1) {
      return `<!doctype html><html lang="es"><head>${meta}</head><body>${html}</body></html>`;
    }
    return `${html.slice(0, bodyOpen)}<head>${meta}</head>${html.slice(bodyOpen)}`;
  }
  const headClose = lower.indexOf('</head>', headOpen);
  if (headClose === -1) {
    return html;
  }
  return `${html.slice(0, headClose)}${meta}${html.slice(headClose)}`;
}

export function buildArtifactBody(options: BuildArtifactOptions): string {
  const wrapped = wrapStandaloneHtml(neutralizeArtifactSource(options.originalHtml));
  const srcdoc = injectArtifactCsp(wrapped, artifactCsp(options.allowCdn));
  const title = escapeText(options.title);
  const description = escapeText(options.description);
  const iframe = `<iframe sandbox="${ARTIFACT_SANDBOX}" title="${title}" srcdoc="${escapeSrcdoc(srcdoc)}"></iframe>`;
  return `<article>\n  <h1>${title}</h1>\n  <section id="descripcion">\n    <p>${description}</p>\n  </section>\n  ${iframe}\n</article>`;
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

export function plainTextFromSrcdoc(srcdoc: string): string {
  const parsed = parseNote(injectArtifactCsp(srcdoc, ARTIFACT_CSP_OFFLINE));
  return parsed.note?.plainText ?? '';
}

export function readArtifactSrcdoc(html: string): string | null {
  let document: DefaultTreeAdapterMap['document'];
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
  const needle = escapeAttr(csp);
  return srcdoc.includes(needle) || srcdoc.includes(csp);
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
