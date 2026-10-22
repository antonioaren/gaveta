import { expect, describe, it } from 'vitest';
import {
  ALLOWED_ATTRIBUTES,
  BODY_ELEMENTS,
  COMPONENTS,
  CONTRACT_CLASSES,
  DATA_ATTRIBUTE_PREFIX,
  DOCUMENT_SHELL,
  FORBIDDEN_ELEMENTS,
  INLINE_STYLE_ATTRIBUTE,
  LINKS,
  NOTE_TYPES,
  NOTE_TYPE_STRUCTURES,
  REMOTE_RESOURCE_POLICY,
  SUGGESTED_REL,
  TASK_LIST,
  TASK_PRIORITIES,
  allocateSlug,
  attributeDiagnostic,
  classifyElement,
  componentById,
  isAllowedAttribute,
  isAllowedBodyElement,
  isAllowedClass,
  isCalloutKind,
  isEventHandlerAttribute,
  isIso8601,
  isJavascriptUrl,
  isNoteType,
  isRemoteUrl,
  isSuggestedRel,
  isTaskPriority,
  isUlid,
  slugify,
  type BodyElement,
} from './index.ts';

const BODY_ELEMENT_NAMES = [
  'article',
  'section',
  'header',
  'footer',
  'aside',
  'nav',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'blockquote',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'hr',
  'br',
  'strong',
  'em',
  'kbd',
  'mark',
  'sub',
  'sup',
  'small',
  'abbr',
  'time',
  'span',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'caption',
  'figure',
  'img',
  'figcaption',
  'picture',
  'source',
  'pre',
  'code',
  'input',
  'gaveta-embed',
] as const;

function bodyElement(name: string): BodyElement {
  const found = BODY_ELEMENTS.find((element) => element.name === name);
  if (found === undefined) {
    throw new Error(`missing element ${name}`);
  }
  return found;
}

describe('authoring contract elements', () => {
  it('allows exactly the body elements from the authoring contract', () => {
    expect(BODY_ELEMENTS.map((element) => element.name)).toEqual([...BODY_ELEMENT_NAMES]);
    expect(new Set(BODY_ELEMENT_NAMES).size).toBe(BODY_ELEMENT_NAMES.length);
    for (const name of BODY_ELEMENT_NAMES) {
      expect(isAllowedBodyElement(name)).toBe(true);
    }
    for (const rejected of ['div', 'script', 'style', 'iframe', 'form', 'span ']) {
      expect(isAllowedBodyElement(rejected)).toBe(false);
    }
  });

  it('groups elements and warns for headings below h3', () => {
    const groups: Record<string, string> = {
      article: 'structure',
      section: 'structure',
      header: 'structure',
      footer: 'structure',
      aside: 'structure',
      nav: 'structure',
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
      h4: 'heading',
      h5: 'heading',
      h6: 'heading',
      p: 'text',
      blockquote: 'text',
      ul: 'text',
      ol: 'text',
      li: 'text',
      dl: 'text',
      dt: 'text',
      dd: 'text',
      hr: 'text',
      br: 'text',
      strong: 'text',
      em: 'text',
      kbd: 'text',
      mark: 'text',
      sub: 'text',
      sup: 'text',
      small: 'text',
      abbr: 'text',
      time: 'text',
      span: 'text',
      a: 'link',
      table: 'data',
      thead: 'data',
      tbody: 'data',
      tr: 'data',
      th: 'data',
      td: 'data',
      caption: 'data',
      figure: 'media',
      img: 'media',
      figcaption: 'media',
      picture: 'media',
      source: 'media',
      pre: 'code',
      code: 'code',
      input: 'task',
      'gaveta-embed': 'component',
    };
    for (const [name, group] of Object.entries(groups)) {
      expect(bodyElement(name).group).toBe(group);
    }
    for (const name of ['h1', 'h2', 'h3']) {
      expect(bodyElement(name).headingWarning).toBe(false);
    }
    for (const name of ['h4', 'h5', 'h6']) {
      expect(bodyElement(name).headingWarning).toBe(true);
    }
    expect(
      BODY_ELEMENTS.filter((element) => element.priority === 'P1').map((element) => element.name),
    ).toEqual(['gaveta-embed']);
  });
});

describe('authoring contract attributes and classes', () => {
  it('allows the documented attribute set and no inline style', () => {
    expect(ALLOWED_ATTRIBUTES).toEqual([
      'id',
      'class',
      'href',
      'src',
      'alt',
      'title',
      'lang',
      'datetime',
      'colspan',
      'rowspan',
      'checked',
      'type',
      'rel',
      'data-kind',
    ]);
    expect(DATA_ATTRIBUTE_PREFIX).toBe('data-g-');
    expect(INLINE_STYLE_ATTRIBUTE).toBe('style');
    expect(isAllowedAttribute('p', 'style')).toBe(false);
    expect(attributeDiagnostic('style')).toBe('W_INLINE_STYLE_REMOVED');
  });

  it('places attributes only on the elements that use them', () => {
    for (const name of BODY_ELEMENT_NAMES) {
      expect(isAllowedAttribute(name, 'id')).toBe(true);
      expect(isAllowedAttribute(name, 'class')).toBe(true);
      expect(isAllowedAttribute(name, 'title')).toBe(true);
      expect(isAllowedAttribute(name, 'lang')).toBe(true);
    }
    expect(isAllowedAttribute('a', 'href')).toBe(true);
    expect(isAllowedAttribute('a', 'rel')).toBe(true);
    expect(isAllowedAttribute('a', 'data-g-to')).toBe(true);
    expect(isAllowedAttribute('a', 'data-g-pending')).toBe(true);
    expect(isAllowedAttribute('a', 'src')).toBe(false);
    expect(isAllowedAttribute('img', 'src')).toBe(true);
    expect(isAllowedAttribute('img', 'alt')).toBe(true);
    expect(isAllowedAttribute('img', 'href')).toBe(false);
    expect(isAllowedAttribute('source', 'src')).toBe(true);
    expect(isAllowedAttribute('source', 'type')).toBe(true);
    expect(isAllowedAttribute('time', 'datetime')).toBe(true);
    expect(isAllowedAttribute('p', 'datetime')).toBe(false);
    expect(isAllowedAttribute('th', 'colspan')).toBe(true);
    expect(isAllowedAttribute('td', 'rowspan')).toBe(true);
    expect(isAllowedAttribute('p', 'colspan')).toBe(false);
    expect(isAllowedAttribute('input', 'type')).toBe(true);
    expect(isAllowedAttribute('input', 'checked')).toBe(true);
    expect(isAllowedAttribute('aside', 'data-kind')).toBe(true);
    expect(isAllowedAttribute('p', 'data-kind')).toBe(false);
    expect(isAllowedAttribute('li', 'data-g-task')).toBe(true);
    expect(isAllowedAttribute('li', 'data-g-due')).toBe(true);
    expect(isAllowedAttribute('li', 'data-g-priority')).toBe(true);
    expect(isAllowedAttribute('p', 'data-g-due')).toBe(false);
    expect(isAllowedAttribute('gaveta-embed', 'data-g-to')).toBe(true);
    expect(isAllowedAttribute('gaveta-embed', 'data-g-section')).toBe(true);
    expect(isAllowedAttribute('a', 'data-g-section')).toBe(false);
    expect(isAllowedAttribute('p', 'data-g-custom')).toBe(true);
    expect(isAllowedAttribute('a', 'data-g-')).toBe(false);
    expect(isAllowedAttribute('a', 'data-g')).toBe(false);
    expect(isAllowedAttribute('script', 'data-g-custom')).toBe(false);
    expect(isAllowedAttribute('A', 'href')).toBe(false);
    expect(isAllowedAttribute('a', 'HREF')).toBe(false);
  });

  it('keeps a closed class list plus language classes on code', () => {
    expect(CONTRACT_CLASSES).toEqual([
      { name: 'callout', elements: ['aside'], priority: 'P0' },
      { name: 'slide', elements: ['section'], priority: 'P0' },
      { name: 'notes', elements: ['aside'], priority: 'P0' },
      { name: 'tasks', elements: ['ul'], priority: 'P0' },
      { name: 'badge', elements: ['span'], priority: 'P0' },
      { name: 'note-header', elements: ['header'], priority: 'P0' },
      { name: 'toc', elements: ['nav'], priority: 'P0' },
      { name: 'mermaid', elements: ['pre'], priority: 'P1' },
    ]);
    expect(isAllowedClass('aside', 'callout')).toBe(true);
    expect(isAllowedClass('aside', 'notes')).toBe(true);
    expect(isAllowedClass('section', 'slide')).toBe(true);
    expect(isAllowedClass('ul', 'tasks')).toBe(true);
    expect(isAllowedClass('pre', 'mermaid')).toBe(true);
    expect(isAllowedClass('span', 'badge')).toBe(true);
    expect(isAllowedClass('header', 'note-header')).toBe(true);
    expect(isAllowedClass('nav', 'toc')).toBe(true);
    expect(isAllowedClass('code', 'language-ts')).toBe(true);
    expect(isAllowedClass('code', 'language-c++')).toBe(true);
    expect(isAllowedClass('code', 'language-c#')).toBe(true);
    expect(isAllowedClass('code', 'language-')).toBe(false);
    expect(isAllowedClass('span', 'language-ts')).toBe(false);
    expect(isAllowedClass('pre', 'slide')).toBe(false);
    expect(isAllowedClass('p', 'callout')).toBe(false);
    expect(isAllowedClass('span', 'highlight')).toBe(false);
    expect(isAllowedClass('ul', ' tasks')).toBe(false);
    expect(isAllowedClass('ul', '')).toBe(false);
    expect(isAllowedClass('div', 'callout')).toBe(false);
  });
});

describe('REQ-TYPE-01 to REQ-TYPE-05 structures and components', () => {
  it('describes doc, slides, and todo', () => {
    expect(NOTE_TYPES).toEqual(['doc', 'slides', 'todo']);
    expect(isNoteType('doc')).toBe(true);
    expect(isNoteType('slides')).toBe(true);
    expect(isNoteType('todo')).toBe(true);
    expect(isNoteType('DOC')).toBe(false);
    expect(isNoteType('document')).toBe(false);

    expect(NOTE_TYPE_STRUCTURES.doc.required).toEqual([
      { element: 'article', className: null, min: 1 },
    ]);
    expect(NOTE_TYPE_STRUCTURES.doc.headings).toEqual({
      plain: ['h1', 'h2', 'h3'],
      warn: ['h4', 'h5', 'h6'],
    });
    expect(NOTE_TYPE_STRUCTURES.doc.sectionIds).toEqual({
      element: 'section',
      required: true,
      algorithm: 'slug',
    });
    expect(NOTE_TYPE_STRUCTURES.doc.tasksAllowed).toBe(true);
    expect(NOTE_TYPE_STRUCTURES.doc.structureError).toBe('E_TYPE_STRUCTURE');
    expect(NOTE_TYPE_STRUCTURES.doc.example).toContain('<article>');
    expect(NOTE_TYPE_STRUCTURES.doc.example).toContain('id="resumen"');

    expect(NOTE_TYPE_STRUCTURES.slides.required).toEqual([
      { element: 'section', className: 'slide', min: 1 },
    ]);
    expect(NOTE_TYPE_STRUCTURES.slides.speakerNotes).toEqual({
      element: 'aside',
      className: 'notes',
    });
    expect(NOTE_TYPE_STRUCTURES.slides.structureError).toBe('E_TYPE_STRUCTURE');
    expect(NOTE_TYPE_STRUCTURES.slides.tasksAllowed).toBe(true);
    expect(NOTE_TYPE_STRUCTURES.slides.example).toContain('class="slide"');
    expect(NOTE_TYPE_STRUCTURES.slides.example).toContain('class="notes"');

    expect(NOTE_TYPE_STRUCTURES.todo.required).toEqual([
      { element: 'ul', className: 'tasks', min: 1 },
    ]);
    expect(NOTE_TYPE_STRUCTURES.todo.tasksAllowed).toBe(true);
    expect(NOTE_TYPE_STRUCTURES.todo.structureError).toBe('E_TYPE_STRUCTURE');
    expect(NOTE_TYPE_STRUCTURES.todo.speakerNotes).toBeNull();
    expect(NOTE_TYPE_STRUCTURES.doc.speakerNotes).toBeNull();
    expect(NOTE_TYPE_STRUCTURES.todo.example).toContain('class="tasks"');
    expect(NOTE_TYPE_STRUCTURES.todo.example).toContain('data-g-task');
    expect(NOTE_TYPE_STRUCTURES.todo.example).toContain('data-g-due="2026-10-22"');
    expect(NOTE_TYPE_STRUCTURES.todo.example).toContain('data-g-priority="high"');
  });

  it('describes a task list that any note type may contain', () => {
    expect(TASK_PRIORITIES).toEqual(['low', 'medium', 'high']);
    expect(TASK_LIST).toEqual({
      element: 'ul',
      className: 'tasks',
      invalidError: 'E_TASK_INVALID',
      idAlgorithm: 'slug',
      item: {
        element: 'li',
        requiredAttributes: ['id', 'data-g-task'],
        dueAttribute: 'data-g-due',
        priorityAttribute: 'data-g-priority',
        priorities: ['low', 'medium', 'high'],
        checkbox: {
          element: 'input',
          type: 'checkbox',
          checkedAttribute: 'checked',
          parentElement: 'li',
          parentAttribute: 'data-g-task',
        },
      },
    });
    expect(isTaskPriority('low')).toBe(true);
    expect(isTaskPriority('medium')).toBe(true);
    expect(isTaskPriority('high')).toBe(true);
    expect(isTaskPriority('urgent')).toBe(false);
    expect(isIso8601('2026-10-22')).toBe(true);
    expect(isIso8601('not-a-date')).toBe(false);
  });

  it('includes a guide example for every P0 component and marks P1 components', () => {
    expect(COMPONENTS.map((component) => component.id)).toEqual([
      'callout',
      'table',
      'figure',
      'code',
      'mermaid',
      'embed',
    ]);
    expect(COMPONENTS.map((component) => component.priority)).toEqual([
      'P0',
      'P0',
      'P0',
      'P0',
      'P1',
      'P1',
    ]);

    const callout = componentById('callout');
    expect(callout?.element).toBe('aside');
    expect(callout?.className).toBe('callout');
    expect(callout?.kinds).toEqual(['info', 'warn', 'warning', 'tip', 'note', 'danger', 'success']);
    expect(callout?.example).toContain('class="callout"');
    expect(callout?.example).toContain('data-kind="info"');
    expect(isCalloutKind('info')).toBe(true);
    expect(isCalloutKind('warn')).toBe(true);
    expect(isCalloutKind('warning')).toBe(true);
    expect(isCalloutKind('tip')).toBe(true);
    expect(isCalloutKind('note')).toBe(true);
    expect(isCalloutKind('danger')).toBe(true);
    expect(isCalloutKind('success')).toBe(true);
    expect(isCalloutKind('bogus')).toBe(false);

    expect(componentById('table')?.example).toContain('<table>');
    expect(componentById('table')?.example).toContain('<th>');
    expect(componentById('table')?.example).toContain('<td>');
    expect(componentById('figure')?.example).toContain('<figure>');
    expect(componentById('figure')?.example).toContain('<img');
    expect(componentById('figure')?.example).toContain('alt=');
    expect(componentById('figure')?.example).toContain('<figcaption>');
    expect(componentById('code')?.example).toContain('<pre>');
    expect(componentById('code')?.example).toContain('class="language-');
    expect(componentById('mermaid')?.example).toContain('class="mermaid"');
    expect(componentById('embed')?.element).toBe('gaveta-embed');
    expect(componentById('embed')?.example).toContain('data-g-to=');
    expect(componentById('embed')?.example).toContain('data-g-section=');
    expect(componentById('missing')).toBeUndefined();

    for (const component of COMPONENTS) {
      expect(component.example).not.toMatch(/<script|on[a-z]+=|javascript:|\sstyle=/i);
      expect(isAllowedBodyElement(component.element)).toBe(true);
    }
  });
});

describe('links, rel, and the document shell', () => {
  it('describes canonical, pending, and external links', () => {
    expect(LINKS.canonical.requiredAttributes).toEqual(['href', 'data-g-to']);
    expect(LINKS.canonical.optionalAttributes).toEqual(['rel']);
    expect(LINKS.canonical.example).toContain('data-g-to="01JB8A2M4R7C9D1E3F5G7H9J0K"');
    expect(isUlid('01JB8A2M4R7C9D1E3F5G7H9J0K')).toBe(true);
    expect(LINKS.pending.requiredAttributes).toEqual(['data-g-pending']);
    expect(LINKS.pending.warning).toBe('W_LINK_PENDING');
    expect(LINKS.pending.example).toContain('data-g-pending="Roadmap"');
    expect(LINKS.external.relIncludes).toEqual(['noopener']);
    expect(LINKS.external.example).toContain('rel="noopener"');
  });

  it('uses the suggested rel vocabulary and warns when it is unknown', () => {
    expect(SUGGESTED_REL).toEqual(['related', 'depends-on', 'part-of', 'supersedes', 'references']);
    for (const rel of SUGGESTED_REL) {
      expect(isSuggestedRel(rel)).toBe(true);
    }
    expect(isSuggestedRel('cousin')).toBe(false);
    expect(isSuggestedRel('Related')).toBe(false);
    expect(LINKS.unknownRel).toEqual({
      warning: 'W_REL_UNKNOWN',
      strictOption: 'rel.strict',
      escalatesToError: true,
    });
  });

  it('records the note shell and the metadata validate will require', () => {
    expect(DOCUMENT_SHELL.elements).toEqual(['html', 'head', 'body', 'meta', 'title', 'link']);
    expect(DOCUMENT_SHELL.requiredMeta).toEqual(['gaveta:id', 'gaveta:type', 'gaveta:created']);
    expect(DOCUMENT_SHELL.optionalMeta).toEqual([
      'gaveta:tags',
      'gaveta:aliases',
      'gaveta:updated',
    ]);
    expect(DOCUMENT_SHELL.titleRequired).toBe(true);
    expect(DOCUMENT_SHELL.charset).toBe('utf-8');
    expect(DOCUMENT_SHELL.theme).toEqual({ rel: 'stylesheet', path: '.gaveta/theme.css' });
  });
});

describe('security boundaries in the contract', () => {
  it('classifies forbidden elements separately from unknown ones', () => {
    expect(FORBIDDEN_ELEMENTS).toEqual({
      script: 'E_UNSAFE_SCRIPT',
      iframe: 'E_UNSAFE_ELEMENT',
      object: 'E_UNSAFE_ELEMENT',
      embed: 'E_UNSAFE_ELEMENT',
      form: 'E_UNSAFE_ELEMENT',
      base: 'E_UNSAFE_ELEMENT',
    });
    expect(classifyElement('article')).toBe('body');
    expect(classifyElement('meta')).toBe('shell');
    expect(classifyElement('script')).toBe('forbidden');
    expect(classifyElement('iframe')).toBe('forbidden');
    expect(classifyElement('div')).toBe('unknown');
    expect(classifyElement('SCRIPT')).toBe('unknown');
  });

  it('recognises event handlers, javascript URLs, and remote resources', () => {
    expect(attributeDiagnostic('onclick')).toBe('E_UNSAFE_HANDLER');
    expect(attributeDiagnostic('ONERROR')).toBe('E_UNSAFE_HANDLER');
    expect(attributeDiagnostic('href')).toBeNull();
    expect(isEventHandlerAttribute('onclick')).toBe(true);
    expect(isEventHandlerAttribute('onClick')).toBe(true);
    expect(isEventHandlerAttribute('on')).toBe(false);
    expect(isEventHandlerAttribute('href')).toBe(false);
    expect(isAllowedAttribute('a', 'onclick')).toBe(false);

    expect(isJavascriptUrl('javascript:alert(1)')).toBe(true);
    expect(isJavascriptUrl('JAVASCRIPT:alert(1)')).toBe(true);
    expect(isJavascriptUrl('  javascript:alert(1)')).toBe(true);
    expect(isJavascriptUrl('java\nscript:alert(1)')).toBe(true);
    expect(isJavascriptUrl('java\tscript:alert(1)')).toBe(true);
    expect(isJavascriptUrl('\u0000javascript:alert(1)')).toBe(true);
    expect(isJavascriptUrl('https://example.com')).toBe(false);
    expect(isJavascriptUrl('./nota.html')).toBe(false);
    expect(isJavascriptUrl('')).toBe(false);

    expect(isRemoteUrl('https://example.com/a.png')).toBe(true);
    expect(isRemoteUrl('http://example.com')).toBe(true);
    expect(isRemoteUrl('HTTP://example.com')).toBe(true);
    expect(isRemoteUrl('//cdn.example.com/a.png')).toBe(true);
    expect(isRemoteUrl('  https://example.com')).toBe(true);
    expect(isRemoteUrl('data:image/png;base64,aaaa')).toBe(false);
    expect(isRemoteUrl('./a.png')).toBe(false);
    expect(isRemoteUrl('attachments/a.png')).toBe(false);
    expect(isRemoteUrl('../.gaveta/theme.css')).toBe(false);
    expect(isRemoteUrl('javascript:alert(1)')).toBe(false);
    expect(REMOTE_RESOURCE_POLICY).toEqual({
      warning: 'W_REMOTE_RESOURCE',
      blockedByDefault: true,
      appliesTo: [
        { element: 'img', attribute: 'src' },
        { element: 'source', attribute: 'src' },
        { element: 'link', attribute: 'href' },
      ],
      exemptElements: ['a'],
    });
  });
});

describe('slug and value rules', () => {
  it('slugifies with the 2026-10-22 rule', () => {
    expect(slugify('Usar SQLite')).toBe('usar-sqlite');
    expect(slugify('Gaveta — PRD')).toBe('gaveta-prd');
    expect(slugify('Árbol')).toBe('arbol');
    expect(slugify('ÁRBOL')).toBe('arbol');
    expect(slugify('Ñandú')).toBe('nandu');
    expect(slugify('Canción')).toBe('cancion');
    expect(slugify('niño')).toBe('nino');
    expect(slugify('nin\u0303o')).toBe('nino');
    expect(slugify('¿Qué es la canción?')).toBe('que-es-la-cancion');
    expect(slugify('El niño comió piñata en la reunión')).toBe(
      'el-nino-comio-pinata-en-la-reunion',
    );
    expect(slugify('  Hola   Mundo  ')).toBe('hola-mundo');
    expect(slugify('foo--bar')).toBe('foo-bar');
    expect(slugify('-foo-')).toBe('foo');
    expect(slugify('123')).toBe('123');
    expect(slugify('')).toBe('');
    expect(slugify('!!!')).toBe('');
    expect(slugify('straße')).toBe('stra-e');
    expect(slugify('naïve café')).toBe('naive-cafe');
    expect(slugify('İstanbul')).toBe('istanbul');
  });

  it('suffixes collisions on the base slug without chaining', () => {
    expect(allocateSlug('nota', new Set())).toBe('nota');
    expect(allocateSlug('nota', new Set(['otra']))).toBe('nota');
    expect(allocateSlug('nota', new Set(['nota']))).toBe('nota-2');
    expect(allocateSlug('nota', new Set(['nota', 'nota-2']))).toBe('nota-3');
    expect(allocateSlug('nota', new Set(['nota', 'nota-2', 'nota-4']))).toBe('nota-3');
    expect(allocateSlug('nota', new Set(['nota-2']))).toBe('nota');
    expect(allocateSlug('nota-2', new Set(['nota-2']))).toBe('nota-2-2');
    expect(allocateSlug('', new Set(['']))).toBe('');
    const taken = new Set<string>();
    const allocate = (title: string): string => {
      const slug = allocateSlug(slugify(title), taken);
      taken.add(slug);
      return slug;
    };
    expect(allocate('Canción del niño')).toBe('cancion-del-nino');
    expect(allocate('Cancion del niño')).toBe('cancion-del-nino-2');
    expect(allocate('CANCIÓN DEL NIÑO')).toBe('cancion-del-nino-3');
  });

  it('accepts calendar dates and timezone-qualified timestamps', () => {
    expect(isIso8601('2026-10-22')).toBe(true);
    expect(isIso8601('2024-02-29')).toBe(true);
    expect(isIso8601('2026-10-22T10:00:00Z')).toBe(true);
    expect(isIso8601('2026-10-22T10:00:00.000Z')).toBe(true);
    expect(isIso8601('2026-10-22T10:00:00.5Z')).toBe(true);
    expect(isIso8601('2026-10-22T10:00:00+00:00')).toBe(true);
    expect(isIso8601('2026-10-22T10:00:00-05:30')).toBe(true);
    expect(isIso8601('')).toBe(false);
    expect(isIso8601('2026-13-01')).toBe(false);
    expect(isIso8601('2026-02-31')).toBe(false);
    expect(isIso8601('2026-02-29')).toBe(false);
    expect(isIso8601('2025-02-29')).toBe(false);
    expect(isIso8601('2024-02-29T24:00:00Z')).toBe(false);
    expect(isIso8601('2026-10-22T10:00Z')).toBe(false);
    expect(isIso8601('2026-10-22T10:00:00')).toBe(false);
    expect(isIso8601('2026-10-22 10:00:00Z')).toBe(false);
    expect(isIso8601('22-10-2026')).toBe(false);
    expect(isIso8601('2026/10/22')).toBe(false);
    expect(isIso8601('2026-10-22T10:00:60Z')).toBe(false);
    expect(isIso8601('2026-10-22T10:60:00Z')).toBe(false);
    expect(isIso8601('2026-10-22T10:00:00+24:00')).toBe(false);
    expect(isIso8601('2026-10-22T10:00:00+05:60')).toBe(false);
  });

  it('accepts Crockford ULIDs', () => {
    expect(isUlid('01JB7Z3K9QX4T5M2N8V6R0WYHC')).toBe(true);
    expect(isUlid('01jb7z3k9qx4t5m2n8v6r0wyhc')).toBe(true);
    expect(isUlid('01JB7Z3K9QX4T5M2N8V6R0WYH')).toBe(false);
    expect(isUlid('01JB7Z3K9QX4T5M2N8V6R0WYHI')).toBe(false);
    expect(isUlid('O1JB7Z3K9QX4T5M2N8V6R0WYHC')).toBe(false);
    expect(isUlid('')).toBe(false);
  });
});
