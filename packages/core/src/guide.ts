import {
  ALLOWED_ATTRIBUTES,
  BODY_ELEMENTS,
  COMPONENTS,
  CONTRACT_CLASSES,
  DATA_ATTRIBUTE_PREFIX,
  DOCUMENT_SHELL,
  LINKS,
  NOTE_TYPES,
  NOTE_TYPE_STRUCTURES,
  SUGGESTED_REL,
  type BodyElement,
  type ElementGroup,
} from './contract.ts';
import { DIAGNOSTICS, formatDiagnostic, type DiagnosticCode, diagnosticCodes } from './errors.ts';

export const GUIDE_TOPICS = [
  'elementos',
  'componentes',
  'tipos',
  'enlaces',
  'comandos',
  'errores',
] as const;

export type GuideTopic = (typeof GUIDE_TOPICS)[number];

export interface GuideCommandEntry {
  readonly name: string;
  readonly summary: string;
  readonly example: string;
  readonly subcommands?: readonly {
    readonly name: string;
    readonly summary: string;
    readonly example: string;
  }[];
}

export interface GuideDiagnosticEntry {
  readonly code: DiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly hint: string;
  readonly exitCode: number | null;
}

export interface GuideBuildOptions {
  readonly topic?: string;
  readonly errorsOnly?: boolean;
  readonly commands: readonly GuideCommandEntry[];
}

export interface GuideResult {
  readonly topics: readonly GuideTopic[];
  readonly human: string;
  readonly data: {
    readonly topics: readonly GuideTopic[];
    readonly elements: readonly {
      readonly name: string;
      readonly group: ElementGroup;
      readonly priority: 'P0' | 'P1';
      readonly headingWarning: boolean;
      readonly attributes: readonly string[];
    }[];
    readonly classes: readonly { readonly name: string; readonly elements: readonly string[] }[];
    readonly components: readonly {
      readonly id: string;
      readonly priority: 'P0' | 'P1';
      readonly example: string;
    }[];
    readonly noteTypes: readonly {
      readonly type: string;
      readonly example: string;
    }[];
    readonly links: {
      readonly canonical: string;
      readonly pending: string;
      readonly external: string;
      readonly wikilink: string;
      readonly suggestedRel: readonly string[];
    };
    readonly commands: readonly GuideCommandEntry[];
    readonly diagnostics: readonly GuideDiagnosticEntry[];
  };
}

const GROUP_LABELS: Record<ElementGroup, string> = {
  structure: 'Estructura',
  heading: 'Encabezados',
  text: 'Texto',
  link: 'Enlaces',
  data: 'Datos',
  media: 'Medios',
  code: 'Código',
  task: 'Tareas',
  component: 'Componentes propios',
};

const WIKILINK_HELP =
  'En el HTML de entrada puedes escribir [[Título]], [[Título#sección]] o [[Título|texto visible]]. ' +
  'Al guardar, el normalizador los convierte en enlaces canónicos o pendientes.';

export function isGuideTopic(value: string): value is GuideTopic {
  return (GUIDE_TOPICS as readonly string[]).includes(value);
}

export function buildGuide(options: GuideBuildOptions): GuideResult {
  const topics = resolveTopics(options);
  const diagnostics = buildDiagnostics();
  const data = {
    topics,
    elements: BODY_ELEMENTS.map((element) => ({
      name: element.name,
      group: element.group,
      priority: element.priority,
      headingWarning: element.headingWarning,
      attributes: element.attributes,
    })),
    classes: CONTRACT_CLASSES.map((entry) => ({
      name: entry.name,
      elements: entry.elements,
    })),
    components: COMPONENTS.map((component) => ({
      id: component.id,
      priority: component.priority,
      example: component.example,
    })),
    noteTypes: NOTE_TYPES.map((type) => ({
      type,
      example: NOTE_TYPE_STRUCTURES[type].example,
    })),
    links: {
      canonical: LINKS.canonical.example,
      pending: LINKS.pending.example,
      external: LINKS.external.example,
      wikilink: WIKILINK_HELP,
      suggestedRel: SUGGESTED_REL,
    },
    commands: [...options.commands],
    diagnostics,
  };

  const sections: string[] = ['Guía de autoría de Gaveta', ''];
  if (topics.includes('elementos')) {
    sections.push(renderElementsSection());
  }
  if (topics.includes('componentes')) {
    sections.push(renderComponentsSection());
  }
  if (topics.includes('tipos')) {
    sections.push(renderTypesSection());
  }
  if (topics.includes('enlaces')) {
    sections.push(renderLinksSection());
  }
  if (topics.includes('comandos')) {
    sections.push(renderCommandsSection(options.commands));
  }
  if (topics.includes('errores')) {
    sections.push(renderDiagnosticsSection(diagnostics));
  }

  return {
    topics,
    human: `${sections.join('\n')}\n`,
    data,
  };
}

function resolveTopics(options: GuideBuildOptions): GuideTopic[] {
  if (options.errorsOnly === true) {
    return ['errores'];
  }
  if (options.topic !== undefined && options.topic.length > 0) {
    if (!isGuideTopic(options.topic)) {
      throw new Error('E_ARG_INVALID');
    }
    return [options.topic];
  }
  return [...GUIDE_TOPICS];
}

function buildDiagnostics(): GuideDiagnosticEntry[] {
  return diagnosticCodes()
    .sort((left, right) => left.localeCompare(right))
    .map((code) => {
      const spec = DIAGNOSTICS[code];
      const formatted = formatDiagnostic(code);
      return {
        code,
        severity: spec.severity,
        message: formatted.message,
        hint: formatted.hint,
        exitCode: spec.exitCode,
      };
    });
}

function renderElementsSection(): string {
  const lines = [
    '## Elementos permitidos',
    '',
    'Metadatos obligatorios en <head>: ' +
      DOCUMENT_SHELL.requiredMeta.join(', ') +
      '. Opcionales: ' +
      DOCUMENT_SHELL.optionalMeta.join(', ') +
      '.',
    `Tema: <link rel="${DOCUMENT_SHELL.theme.rel}" href="${DOCUMENT_SHELL.theme.path}"> (ruta relativa según la profundidad de la nota).`,
    `Atributos globales en el cuerpo: ${ALLOWED_ATTRIBUTES.join(', ')}, y cualquier ${DATA_ATTRIBUTE_PREFIX}* no reservado.`,
    '',
  ];
  const byGroup = new Map<ElementGroup, BodyElement[]>();
  for (const element of BODY_ELEMENTS) {
    const bucket = byGroup.get(element.group) ?? [];
    bucket.push(element);
    byGroup.set(element.group, bucket);
  }
  for (const group of Object.keys(GROUP_LABELS) as ElementGroup[]) {
    const elements = byGroup.get(group);
    if (elements === undefined || elements.length === 0) {
      continue;
    }
    lines.push(`### ${GROUP_LABELS[group]}`);
    for (const element of elements) {
      const flags: string[] = [];
      if (element.priority === 'P1') {
        flags.push('P1');
      }
      if (element.headingWarning) {
        flags.push('con aviso');
      }
      const suffix = flags.length === 0 ? '' : ` (${flags.join(', ')})`;
      lines.push(`- <${element.name}>${suffix}`);
    }
    lines.push('');
  }
  lines.push('### Clases del contrato');
  for (const entry of CONTRACT_CLASSES) {
    lines.push(`- .${entry.name} en ${entry.elements.map((name) => `<${name}>`).join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderComponentsSection(): string {
  const lines = ['## Componentes', ''];
  for (const component of COMPONENTS) {
    const label = component.priority === 'P1' ? ' (P1)' : '';
    lines.push(`### ${component.id}${label}`);
    lines.push(component.example);
    lines.push('');
  }
  return lines.join('\n');
}

function renderTypesSection(): string {
  const lines = ['## Tipos de nota', '', `Valores de gaveta:type: ${NOTE_TYPES.join(', ')}.`, ''];
  for (const type of NOTE_TYPES) {
    lines.push(`### ${type}`);
    lines.push(NOTE_TYPE_STRUCTURES[type].example);
    lines.push('');
  }
  return lines.join('\n');
}

function renderLinksSection(): string {
  return [
    '## Convenciones de enlace',
    '',
    '### Canónico (resuelto)',
    LINKS.canonical.example,
    '',
    '### Pendiente',
    LINKS.pending.example,
    '',
    '### Externo',
    LINKS.external.example,
    '',
    '### Wikilinks en el HTML de entrada',
    WIKILINK_HELP,
    '',
    '### Valores sugeridos de rel',
    SUGGESTED_REL.join(', '),
    '',
  ].join('\n');
}

function renderCommandsSection(commands: readonly GuideCommandEntry[]): string {
  const lines = ['## Comandos de la CLI', ''];
  for (const command of commands) {
    lines.push(`### ${command.name}`);
    lines.push(command.summary);
    lines.push(`Ejemplo: ${command.example}`);
    for (const sub of command.subcommands ?? []) {
      lines.push(`- ${sub.name}: ${sub.summary}`);
      lines.push(`  Ejemplo: ${sub.example}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderDiagnosticsSection(diagnostics: readonly GuideDiagnosticEntry[]): string {
  const lines = ['## Catálogo de errores y avisos', ''];
  for (const entry of diagnostics) {
    const exit = entry.exitCode === null ? 'aviso' : `salida ${entry.exitCode.toString()}`;
    lines.push(`### ${entry.code} (${entry.severity}, ${exit})`);
    lines.push(entry.message);
    lines.push(`Sugerencia: ${entry.hint}`);
    lines.push('');
  }
  return lines.join('\n');
}
