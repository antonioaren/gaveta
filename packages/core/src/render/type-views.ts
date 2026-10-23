import type { NoteType } from '../contract.ts';
import { escapeAttr, escapeText } from '../links/path.ts';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { serializeOuter } from 'parse5';

type ParseDocument = DefaultTreeAdapterMap['document'];
type ParseElement = DefaultTreeAdapterMap['element'];
type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseText = DefaultTreeAdapterMap['textNode'];

export interface RenderTypeLayout {
  readonly html: string;
  readonly scripts: readonly string[];
}

export interface SlideThumbTarget {
  readonly id: string;
  readonly label: string;
}

export function buildRenderTypeLayout(noteType: NoteType, bodyInner: string): RenderTypeLayout {
  switch (noteType) {
    case 'slides':
      return layoutSlides(bodyInner);
    case 'todo':
      return layoutTodo(bodyInner);
    case 'dashboard':
      return layoutWideArtifact('dashboard', bodyInner);
    case 'design':
      return layoutWideArtifact('design', bodyInner);
    case 'artifact':
      return layoutWideArtifact('artifact', bodyInner);
    default:
      return layoutDoc(bodyInner);
  }
}

function layoutDoc(bodyInner: string): RenderTypeLayout {
  const { toc, main } = splitOrBuildDocToc(bodyInner);
  const tocBlock =
    toc.length > 0 ? `<aside class="gaveta-render__toc" aria-label="Índice">${toc}</aside>` : '';
  const html = [
    '<div class="gaveta-render gaveta-render--doc">',
    tocBlock,
    `<main class="gaveta-render__main">${main}</main>`,
    '</div>',
  ].join('');
  return { html, scripts: [] };
}

function layoutWideArtifact(
  kind: 'dashboard' | 'design' | 'artifact',
  bodyInner: string,
): RenderTypeLayout {
  const html = [
    `<div class="gaveta-render gaveta-render--${kind}">`,
    `<main class="gaveta-render__main gaveta-render__main--wide">${bodyInner}</main>`,
    '</div>',
  ].join('');
  return { html, scripts: [] };
}

function layoutSlides(bodyInner: string): RenderTypeLayout {
  const thumbs = collectSlideThumbTargets(bodyInner);
  const thumbButtons = thumbs
    .map(
      (slide, index) =>
        `<button type="button" class="gaveta-slide-thumb" data-gaveta-slide-thumb="${escapeAttr(slide.id)}" aria-label="${escapeAttr(`Diapositiva ${String(index + 1)}: ${slide.label}`)}"><span class="gaveta-slide-thumb__label">${escapeText(slide.label)}</span></button>`,
    )
    .join('');
  const html = [
    '<div class="gaveta-render gaveta-render--slides">',
    '<div class="gaveta-slides-toolbar">',
    '<button type="button" class="gaveta-slides-present" data-gaveta-action="present">Presentar</button>',
    '<p class="gaveta-slides-hint">Flechas para navegar · Esc para salir</p>',
    '</div>',
    `<nav class="gaveta-slide-thumbs" aria-label="Miniaturas">${thumbButtons}</nav>`,
    `<div class="gaveta-slides-deck">${bodyInner}</div>`,
    '<div id="gaveta-slide-live" class="gaveta-visually-hidden" aria-live="polite"></div>',
    '</div>',
  ].join('');
  return { html, scripts: ['render-slides.js'] };
}

function layoutTodo(bodyInner: string): RenderTypeLayout {
  const html = [
    '<div class="gaveta-render gaveta-render--todo">',
    '<div class="gaveta-todo-filters" role="toolbar" aria-label="Filtrar tareas">',
    '<button type="button" data-filter="all" aria-pressed="true">Todas</button>',
    '<button type="button" data-filter="open" aria-pressed="false">Pendientes</button>',
    '<button type="button" data-filter="done" aria-pressed="false">Hechas</button>',
    '</div>',
    `<main class="gaveta-render__main">${bodyInner}</main>`,
    '</div>',
  ].join('');
  return { html, scripts: ['render-todo.js'] };
}

export function collectSlideThumbTargets(bodyInner: string): SlideThumbTarget[] {
  let document: ParseDocument;
  try {
    document = parse(`<body>${bodyInner}</body>`, { scriptingEnabled: false });
  } catch {
    return [];
  }
  const body = findElement(document, 'body');
  if (body === null) {
    return [];
  }
  const slides: SlideThumbTarget[] = [];
  walkElements(body, (element) => {
    if (element.tagName.toLowerCase() !== 'section') {
      return;
    }
    const classAttr = element.attrs.find((entry) => entry.name === 'class');
    const classes = classAttr?.value.split(/\s+/u) ?? [];
    if (!classes.includes('slide')) {
      return;
    }
    const idAttr = element.attrs.find((entry) => entry.name === 'id');
    const id = idAttr?.value.trim() ?? '';
    if (id.length === 0) {
      return;
    }
    const label = firstHeadingText(element) ?? id;
    slides.push({ id, label });
  });
  return slides;
}

function splitOrBuildDocToc(bodyInner: string): { readonly toc: string; readonly main: string } {
  let document: ParseDocument;
  try {
    document = parse(`<body>${bodyInner}</body>`, { scriptingEnabled: false });
  } catch {
    const built = buildAutoToc(bodyInner);
    return { toc: built, main: bodyInner };
  }
  const body = findElement(document, 'body');
  if (body === null) {
    const built = buildAutoToc(bodyInner);
    return { toc: built, main: bodyInner };
  }
  const tocElement = findDocTocNav(body);
  if (tocElement === null) {
    const built = buildAutoToc(bodyInner);
    return { toc: built, main: bodyInner };
  }
  const toc = serializeOuter(tocElement);
  detachElement(tocElement);
  const mainParts: string[] = [];
  for (const child of body.childNodes) {
    mainParts.push(serializeOuter(child));
  }
  return { toc, main: mainParts.join('').trim() };
}

function detachElement(element: ParseElement): void {
  const parent = element.parentNode;
  if (parent === null || !('childNodes' in parent)) {
    return;
  }
  const index = parent.childNodes.indexOf(element);
  if (index !== -1) {
    parent.childNodes.splice(index, 1);
  }
}

function findDocTocNav(body: ParseElement): ParseElement | null {
  let found: ParseElement | null = null;
  walkElements(body, (element) => {
    if (found !== null) {
      return;
    }
    if (element.tagName.toLowerCase() !== 'nav') {
      return;
    }
    const classAttr = element.attrs.find((entry) => entry.name === 'class');
    const classes = classAttr?.value.split(/\s+/u) ?? [];
    if (classes.includes('toc')) {
      found = element;
    }
  });
  return found;
}

function buildAutoToc(bodyInner: string): string {
  let document: ParseDocument;
  try {
    document = parse(`<body>${bodyInner}</body>`, { scriptingEnabled: false });
  } catch {
    return '';
  }
  const body = findElement(document, 'body');
  if (body === null) {
    return '';
  }
  const links: string[] = [];
  walkElements(body, (element) => {
    const tag = element.tagName.toLowerCase();
    if (tag !== 'h2' && tag !== 'h3') {
      return;
    }
    const idAttr = element.attrs.find((entry) => entry.name === 'id');
    const id = idAttr?.value.trim() ?? '';
    if (id.length === 0) {
      return;
    }
    const text = textContent(element).trim();
    if (text.length === 0) {
      return;
    }
    const indent = tag === 'h3' ? ' class="toc-h3"' : '';
    links.push(`<a href="#${escapeAttr(id)}"${indent}>${escapeText(text)}</a>`);
  });
  if (links.length === 0) {
    return '';
  }
  return `<nav class="toc">${links.join('')}</nav>`;
}

function firstHeadingText(element: ParseElement): string | null {
  for (const child of element.childNodes) {
    if (!('tagName' in child)) {
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const text = textContent(child).trim();
      if (text.length > 0) {
        return text;
      }
    }
  }
  return null;
}

function isTextNode(node: ParseChild): node is ParseText {
  return node.nodeName === '#text';
}

function textContent(node: ParseChild): string {
  if (isTextNode(node)) {
    return node.value;
  }
  if (!('tagName' in node)) {
    return '';
  }
  return node.childNodes.map((child) => textContent(child)).join('');
}

function findElement(node: ParseChild | ParseDocument, tagName: string): ParseElement | null {
  if ('tagName' in node && node.tagName.toLowerCase() === tagName) {
    return node;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const found = findElement(child, tagName);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function walkElements(root: ParseElement, visit: (element: ParseElement) => void): void {
  const queue: ParseChild[] = [...root.childNodes];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || !('tagName' in current)) {
      continue;
    }
    visit(current);
    for (const child of current.childNodes) {
      queue.push(child);
    }
  }
}
