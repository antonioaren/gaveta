/**
 * Authoring contract. The validator, the editor schema, and `gaveta guide`
 * read this module instead of copying element, class, and type rules.
 */
import type { DiagnosticCode } from './errors.ts';

const TYPE_STRUCTURE_ERROR = 'E_TYPE_STRUCTURE' satisfies DiagnosticCode;
const TASK_INVALID_ERROR = 'E_TASK_INVALID' satisfies DiagnosticCode;

export const NOTE_TYPES = ['doc', 'slides', 'todo', 'dashboard', 'design', 'artifact'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export const SUGGESTED_REL = [
  'related',
  'depends-on',
  'part-of',
  'supersedes',
  'references',
] as const;

export const ALLOWED_ATTRIBUTES = [
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
  'sandbox',
  'srcdoc',
] as const;

export const ARTIFACT_ONLY_ELEMENTS = ['iframe'] as const;

export const DATA_ATTRIBUTE_PREFIX = 'data-g-';

/** Not an allowed attribute. The normalizer removes it and reports this warning. */
export const INLINE_STYLE_ATTRIBUTE = 'style';

export const DOCUMENT_SHELL = {
  elements: ['html', 'head', 'body', 'meta', 'title', 'link'],
  requiredMeta: ['gaveta:id', 'gaveta:type', 'gaveta:created'],
  optionalMeta: ['gaveta:tags', 'gaveta:aliases', 'gaveta:updated', 'gaveta:artifact-cdn'],
  titleRequired: true,
  charset: 'utf-8',
  theme: { rel: 'stylesheet', path: '.gaveta/theme.css' },
} as const;

export const FORBIDDEN_ELEMENTS = {
  script: 'E_UNSAFE_SCRIPT',
  object: 'E_UNSAFE_ELEMENT',
  embed: 'E_UNSAFE_ELEMENT',
  form: 'E_UNSAFE_ELEMENT',
  base: 'E_UNSAFE_ELEMENT',
} as const satisfies Record<string, DiagnosticCode>;

export const REMOTE_RESOURCE_POLICY = {
  warning: 'W_REMOTE_RESOURCE',
  blockedByDefault: true,
  appliesTo: [
    { element: 'img', attribute: 'src' },
    { element: 'source', attribute: 'src' },
    { element: 'link', attribute: 'href' },
  ],
  exemptElements: ['a'],
} as const satisfies {
  warning: DiagnosticCode;
  blockedByDefault: boolean;
  appliesTo: readonly { element: string; attribute: string }[];
  exemptElements: readonly string[];
};

export type ElementGroup =
  'structure' | 'heading' | 'text' | 'link' | 'data' | 'media' | 'code' | 'task' | 'component';

export interface BodyElement {
  readonly name: string;
  readonly group: ElementGroup;
  /** True for h4–h6. The diagnostic catalog does not assign that warning a code. */
  readonly headingWarning: boolean;
  readonly priority: 'P0' | 'P1';
  readonly attributes: readonly string[];
}

export interface ContractClass {
  readonly name: string;
  readonly elements: readonly string[];
  readonly priority: 'P0' | 'P1';
}

export interface ContractComponent {
  readonly id: string;
  readonly priority: 'P0' | 'P1';
  readonly element: string;
  readonly example: string;
  readonly className?: string;
  readonly kinds?: readonly string[];
}

export interface NoteTypeStructure {
  readonly required: readonly {
    readonly element: string;
    readonly className: string | null;
    readonly min: number;
  }[];
  readonly headings: {
    readonly plain: readonly string[];
    readonly warn: readonly string[];
  };
  readonly sectionIds: {
    readonly element: string;
    readonly required: boolean;
    readonly algorithm: 'slug';
  } | null;
  readonly speakerNotes: {
    readonly element: string;
    readonly className: string;
  } | null;
  readonly tasksAllowed: boolean;
  readonly structureError: typeof TYPE_STRUCTURE_ERROR;
  readonly example: string;
}

const GLOBAL_ATTRIBUTES = ['id', 'class', 'title', 'lang'] as const;

const KNOWN_DATA_ATTRIBUTES: ReadonlySet<string> = new Set([
  'data-g-to',
  'data-g-pending',
  'data-g-section',
  'data-g-task',
  'data-g-due',
  'data-g-priority',
  'data-device',
]);

const CALLOUT_KINDS = ['info', 'warn', 'warning', 'tip', 'note', 'danger', 'success'] as const;

const HEADINGS = {
  plain: ['h1', 'h2', 'h3'],
  warn: ['h4', 'h5', 'h6'],
} as const;

function defineElement(
  name: string,
  group: ElementGroup,
  extra: readonly string[] = [],
  options: { readonly priority?: 'P0' | 'P1'; readonly headingWarning?: boolean } = {},
): BodyElement {
  return {
    name,
    group,
    priority: options.priority ?? 'P0',
    headingWarning: options.headingWarning ?? false,
    attributes: [...GLOBAL_ATTRIBUTES, ...extra],
  };
}

export const BODY_ELEMENTS: readonly BodyElement[] = [
  defineElement('article', 'structure'),
  defineElement('section', 'structure'),
  defineElement('header', 'structure'),
  defineElement('footer', 'structure'),
  defineElement('aside', 'structure', ['data-kind']),
  defineElement('nav', 'structure'),
  defineElement('h1', 'heading'),
  defineElement('h2', 'heading'),
  defineElement('h3', 'heading'),
  defineElement('h4', 'heading', [], { headingWarning: true }),
  defineElement('h5', 'heading', [], { headingWarning: true }),
  defineElement('h6', 'heading', [], { headingWarning: true }),
  defineElement('p', 'text'),
  defineElement('blockquote', 'text'),
  defineElement('ul', 'text'),
  defineElement('ol', 'text'),
  defineElement('li', 'text', ['data-g-task', 'data-g-due', 'data-g-priority']),
  defineElement('dl', 'text'),
  defineElement('dt', 'text'),
  defineElement('dd', 'text'),
  defineElement('hr', 'text'),
  defineElement('br', 'text'),
  defineElement('strong', 'text'),
  defineElement('em', 'text'),
  defineElement('kbd', 'text'),
  defineElement('mark', 'text'),
  defineElement('sub', 'text'),
  defineElement('sup', 'text'),
  defineElement('small', 'text'),
  defineElement('abbr', 'text'),
  defineElement('time', 'text', ['datetime']),
  defineElement('span', 'text'),
  defineElement('a', 'link', ['href', 'rel', 'data-g-to', 'data-g-pending']),
  defineElement('table', 'data'),
  defineElement('thead', 'data'),
  defineElement('tbody', 'data'),
  defineElement('tr', 'data'),
  defineElement('th', 'data', ['colspan', 'rowspan']),
  defineElement('td', 'data', ['colspan', 'rowspan']),
  defineElement('caption', 'data'),
  defineElement('figure', 'media'),
  defineElement('img', 'media', ['src', 'alt']),
  defineElement('figcaption', 'media'),
  defineElement('picture', 'media'),
  defineElement('source', 'media', ['src', 'type']),
  defineElement('pre', 'code'),
  defineElement('code', 'code'),
  defineElement('input', 'task', ['type', 'checked']),
  defineElement('gaveta-embed', 'component', ['data-g-to', 'data-g-section'], {
    priority: 'P1',
  }),
  defineElement('gaveta-kpi', 'component', ['data-label']),
  defineElement('gaveta-chart', 'component', ['type']),
  defineElement('iframe', 'component', ['sandbox', 'srcdoc'], { priority: 'P0' }),
];

const ELEMENTS_BY_NAME: ReadonlyMap<string, BodyElement> = new Map(
  BODY_ELEMENTS.map((element) => [element.name, element]),
);

export const CONTRACT_CLASSES: readonly ContractClass[] = [
  { name: 'callout', elements: ['aside'], priority: 'P0' },
  { name: 'slide', elements: ['section'], priority: 'P0' },
  { name: 'notes', elements: ['aside'], priority: 'P0' },
  { name: 'tasks', elements: ['ul'], priority: 'P0' },
  { name: 'badge', elements: ['span'], priority: 'P0' },
  { name: 'note-header', elements: ['header'], priority: 'P0' },
  { name: 'toc', elements: ['nav'], priority: 'P0' },
  { name: 'mermaid', elements: ['pre'], priority: 'P1' },
  { name: 'g-frame', elements: ['section'], priority: 'P0' },
  { name: 'g-dashboard', elements: ['article'], priority: 'P0' },
  { name: 'g-kpi', elements: ['gaveta-kpi'], priority: 'P0' },
];

const CLASSES_BY_NAME: ReadonlyMap<string, ContractClass> = new Map(
  CONTRACT_CLASSES.map((entry) => [entry.name, entry]),
);

/** `language-*` on `<code>`, from the code-block component. Not a fixed class name. */
const LANGUAGE_CLASS = /^language-[A-Za-z0-9][A-Za-z0-9_+#.-]*$/;

export const COMPONENTS: readonly ContractComponent[] = [
  {
    id: 'callout',
    priority: 'P0',
    element: 'aside',
    className: 'callout',
    kinds: CALLOUT_KINDS,
    example: '<aside class="callout" data-kind="info">\n  <p>Texto del aviso.</p>\n</aside>',
  },
  {
    id: 'table',
    priority: 'P0',
    element: 'table',
    example:
      '<table>\n  <thead>\n    <tr>\n      <th>Clave</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr>\n      <td>Valor</td>\n    </tr>\n  </tbody>\n</table>',
  },
  {
    id: 'figure',
    priority: 'P0',
    element: 'figure',
    example:
      '<figure>\n  <img src="attachments/diagrama.png" alt="Diagrama del vault">\n  <figcaption>Diagrama del vault</figcaption>\n</figure>',
  },
  {
    id: 'code',
    priority: 'P0',
    element: 'pre',
    example: '<pre><code class="language-ts">const vault = true;</code></pre>',
  },
  {
    id: 'mermaid',
    priority: 'P1',
    element: 'pre',
    className: 'mermaid',
    example: '<pre class="mermaid">graph LR\n  A-->B</pre>',
  },
  {
    id: 'embed',
    priority: 'P1',
    element: 'gaveta-embed',
    example:
      '<gaveta-embed data-g-to="01JB7Z3K9QX4T5M2N8V6R0WYHC" data-g-section="resumen"></gaveta-embed>',
  },
  {
    id: 'kpi',
    priority: 'P0',
    element: 'gaveta-kpi',
    className: 'g-kpi',
    example: '<gaveta-kpi class="g-kpi" data-label="Usuarios activos">1.240</gaveta-kpi>',
  },
  {
    id: 'chart',
    priority: 'P0',
    element: 'gaveta-chart',
    example:
      '<gaveta-chart type="bar">\n  <table>\n    <thead><tr><th>Mes</th><th>Ventas</th></tr></thead>\n    <tbody><tr><td>Ene</td><td>12</td></tr></tbody>\n  </table>\n</gaveta-chart>',
  },
];

const COMPONENTS_BY_ID: ReadonlyMap<string, ContractComponent> = new Map(
  COMPONENTS.map((component) => [component.id, component]),
);

export const TASK_LIST = {
  element: 'ul',
  className: 'tasks',
  invalidError: TASK_INVALID_ERROR,
  idAlgorithm: 'slug',
  item: {
    element: 'li',
    requiredAttributes: ['id', 'data-g-task'],
    dueAttribute: 'data-g-due',
    priorityAttribute: 'data-g-priority',
    priorities: TASK_PRIORITIES,
    checkbox: {
      element: 'input',
      type: 'checkbox',
      checkedAttribute: 'checked',
      parentElement: 'li',
      parentAttribute: 'data-g-task',
    },
  },
} as const;

export const NOTE_TYPE_STRUCTURES: Record<NoteType, NoteTypeStructure> = {
  doc: {
    required: [{ element: 'article', className: null, min: 1 }],
    headings: HEADINGS,
    sectionIds: { element: 'section', required: true, algorithm: 'slug' },
    speakerNotes: null,
    tasksAllowed: true,
    structureError: TYPE_STRUCTURE_ERROR,
    example:
      '<article>\n  <h1>Título</h1>\n  <section id="resumen">\n    <h2>Resumen</h2>\n    <p>Texto.</p>\n  </section>\n</article>',
  },
  slides: {
    required: [{ element: 'section', className: 'slide', min: 1 }],
    headings: HEADINGS,
    sectionIds: null,
    speakerNotes: { element: 'aside', className: 'notes' },
    tasksAllowed: true,
    structureError: TYPE_STRUCTURE_ERROR,
    example:
      '<section class="slide" id="portada">\n  <h1>Portada</h1>\n  <aside class="notes">\n    <p>Notas del ponente.</p>\n  </aside>\n</section>',
  },
  todo: {
    required: [{ element: 'ul', className: 'tasks', min: 1 }],
    headings: HEADINGS,
    sectionIds: null,
    speakerNotes: null,
    tasksAllowed: true,
    structureError: TYPE_STRUCTURE_ERROR,
    example:
      '<ul class="tasks">\n  <li data-g-task id="revisar-contrato" data-g-due="2026-10-22" data-g-priority="high">\n    <input type="checkbox">\n    Revisar el contrato\n  </li>\n</ul>',
  },
  dashboard: {
    required: [
      { element: 'article', className: 'g-dashboard', min: 1 },
      { element: 'gaveta-kpi', className: null, min: 1 },
    ],
    headings: HEADINGS,
    sectionIds: { element: 'section', required: false, algorithm: 'slug' },
    speakerNotes: null,
    tasksAllowed: true,
    structureError: TYPE_STRUCTURE_ERROR,
    example:
      '<article class="g-dashboard">\n  <h1>Panel</h1>\n  <gaveta-kpi class="g-kpi" data-label="KPI">42</gaveta-kpi>\n  <gaveta-chart type="line">\n    <table><tbody><tr><td>A</td><td>1</td></tr></tbody></table>\n  </gaveta-chart>\n</article>',
  },
  design: {
    required: [{ element: 'section', className: 'g-frame', min: 1 }],
    headings: HEADINGS,
    sectionIds: null,
    speakerNotes: null,
    tasksAllowed: false,
    structureError: TYPE_STRUCTURE_ERROR,
    example:
      '<section class="g-frame" data-device="desktop" id="inicio">\n  <h2>Inicio</h2>\n  <p>Mockup de la pantalla principal.</p>\n</section>',
  },
  artifact: {
    required: [
      { element: 'article', className: null, min: 1 },
      { element: 'iframe', className: null, min: 1 },
    ],
    headings: HEADINGS,
    sectionIds: { element: 'section', required: true, algorithm: 'slug' },
    speakerNotes: null,
    tasksAllowed: false,
    structureError: TYPE_STRUCTURE_ERROR,
    example:
      '<article>\n  <h1>Demo interactiva</h1>\n  <section id="descripcion">\n    <p>Contenido importado desde Claude.</p>\n  </section>\n  <iframe sandbox="allow-scripts" title="Demo" srcdoc="&lt;!doctype html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;/head&gt;&lt;body&gt;&lt;p&gt;Hola&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>\n</article>',
  },
};

export const LINKS = {
  canonical: {
    requiredAttributes: ['href', 'data-g-to'],
    optionalAttributes: ['rel'],
    example:
      '<a href="../decisiones/usar-sqlite.html" data-g-to="01JB8A2M4R7C9D1E3F5G7H9J0K" rel="depends-on">Usar SQLite</a>',
  },
  pending: {
    requiredAttributes: ['data-g-pending'],
    warning: 'W_LINK_PENDING' as const satisfies DiagnosticCode,
    example: '<a data-g-pending="Roadmap">Roadmap</a>',
  },
  external: {
    relIncludes: ['noopener'],
    example: '<a href="https://example.com" rel="noopener">Example</a>',
  },
  unknownRel: {
    warning: 'W_REL_UNKNOWN' as const satisfies DiagnosticCode,
    strictOption: 'rel.strict',
    escalatesToError: true,
  },
} as const;

const SHELL_ELEMENTS: ReadonlySet<string> = new Set(DOCUMENT_SHELL.elements);
const SUGGESTED_REL_SET: ReadonlySet<string> = new Set(SUGGESTED_REL);

export type ElementPlace = 'body' | 'shell' | 'forbidden' | 'unknown';

export function isNoteType(value: string): value is NoteType {
  return (NOTE_TYPES as readonly string[]).includes(value);
}

export function isAllowedBodyElement(name: string): boolean {
  return ELEMENTS_BY_NAME.has(name);
}

export function isAllowedAttribute(element: string, attribute: string): boolean {
  const spec = ELEMENTS_BY_NAME.get(element);
  if (spec === undefined) {
    return false;
  }
  if (spec.attributes.includes(attribute)) {
    return true;
  }
  if (
    !attribute.startsWith(DATA_ATTRIBUTE_PREFIX) ||
    attribute.length === DATA_ATTRIBUTE_PREFIX.length
  ) {
    return false;
  }
  return !KNOWN_DATA_ATTRIBUTES.has(attribute);
}

export function isAllowedClass(element: string, className: string): boolean {
  if (!isAllowedBodyElement(element) || className.length === 0) {
    return false;
  }
  if (element === 'code' && LANGUAGE_CLASS.test(className)) {
    return true;
  }
  const spec = CLASSES_BY_NAME.get(className);
  if (spec === undefined) {
    return false;
  }
  return spec.elements.includes(element);
}

export function isSuggestedRel(value: string): boolean {
  return SUGGESTED_REL_SET.has(value);
}

export function isCalloutKind(value: string): boolean {
  return (CALLOUT_KINDS as readonly string[]).includes(value);
}

export function isTaskPriority(value: string): boolean {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function componentById(id: string): ContractComponent | undefined {
  return COMPONENTS_BY_ID.get(id);
}

export function classifyElement(name: string): ElementPlace {
  if (ELEMENTS_BY_NAME.has(name)) {
    return 'body';
  }
  if (SHELL_ELEMENTS.has(name)) {
    return 'shell';
  }
  if (Object.hasOwn(FORBIDDEN_ELEMENTS, name)) {
    return 'forbidden';
  }
  return 'unknown';
}

export function isEventHandlerAttribute(name: string): boolean {
  return /^on[a-z]/i.test(name);
}

export function attributeDiagnostic(name: string): DiagnosticCode | null {
  if (isEventHandlerAttribute(name)) {
    return 'E_UNSAFE_HANDLER';
  }
  if (name === INLINE_STYLE_ATTRIBUTE) {
    return 'W_INLINE_STYLE_REMOVED';
  }
  return null;
}

/** ASCII controls and space. Stripped so `java\nscript:` still matches. */
const MAX_IGNORED_CHAR_CODE = 0x20;

export function isJavascriptUrl(value: string): boolean {
  let compact = '';
  for (const character of value) {
    if (character.charCodeAt(0) > MAX_IGNORED_CHAR_CODE) {
      compact += character;
    }
  }
  return /^javascript:/i.test(compact);
}

export function isRemoteUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('//');
}

/** Lowercase, strip marks, then map every other character to a hyphen. Shared by filenames and section ids. */
export function slugify(value: string): string {
  const lowered = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
  return lowered.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Collision suffix on the original base (`-2`, `-3`, …).
 * Does not chain: a taken `base-2` yields `base-3`, not `base-2-2`.
 */
export function allocateSlug(base: string, taken: ReadonlySet<string>): string {
  if (base.length === 0) {
    return '';
  }
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix.toString()}`)) {
    suffix += 1;
  }
  return `${base}-${suffix.toString()}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function group(match: RegExpMatchArray, index: number): string | undefined {
  return match[index];
}

function inRange(value: string, min: number, max: number): boolean {
  const parsed = Number(value);
  return parsed >= min && parsed <= max;
}

function isCalendarDate(yearText: string, monthText: string, dayText: string): boolean {
  if (!inRange(monthText, 1, 12) || !inRange(dayText, 1, 31)) {
    return false;
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Calendar date, or a timestamp with seconds and a timezone. */
export function isIso8601(value: string): boolean {
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly !== null) {
    const year = group(dateOnly, 1);
    const month = group(dateOnly, 2);
    const day = group(dateOnly, 3);
    if (year === undefined || month === undefined || day === undefined) {
      return false;
    }
    return isCalendarDate(year, month, day);
  }

  const dateTime = DATE_TIME.exec(value);
  if (dateTime === null) {
    return false;
  }
  const year = group(dateTime, 1);
  const month = group(dateTime, 2);
  const day = group(dateTime, 3);
  const hour = group(dateTime, 4);
  const minute = group(dateTime, 5);
  const second = group(dateTime, 6);
  const zone = group(dateTime, 7);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    zone === undefined
  ) {
    return false;
  }
  if (!isCalendarDate(year, month, day) || !inRange(hour, 0, 23) || !inRange(minute, 0, 59)) {
    return false;
  }
  if (!inRange(second, 0, 59)) {
    return false;
  }
  if (zone === 'Z') {
    return true;
  }
  return inRange(zone.slice(1, 3), 0, 23) && inRange(zone.slice(4, 6), 0, 59);
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export function isUlid(value: string): boolean {
  return ULID.test(value);
}
