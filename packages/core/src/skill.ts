import { AGENT_VAULT_BULLETS, AGENT_WORKFLOW_BULLETS } from './agent-workflow.ts';
import { NOTE_TYPES, NOTE_TYPE_STRUCTURES } from './contract.ts';
import type { GuideCommandEntry } from './guide.ts';

export const SKILL_NAME = 'gaveta';
export const SKILL_CLI_VERSION_FIELD = 'gaveta-cli-version';

export const SKILL_REFERENCE_PATHS = {
  workflow: 'references/flujo.md',
  noteTypes: 'references/tipos-de-nota.md',
} as const;

export interface SkillFile {
  readonly path: string;
  readonly contents: string;
}

export interface SkillBuildOptions {
  readonly commands: readonly GuideCommandEntry[];
  readonly cliVersion: string;
}

export interface SkillBundle {
  readonly cliVersion: string;
  readonly files: readonly SkillFile[];
}

const AGENT_COMMAND_NAMES = [
  'search',
  'new',
  'edit',
  'read',
  'backlinks',
  'graph',
  'validate',
  'doctor',
  'guide',
] as const;

function yamlScalar(value: string): string {
  if (/^[a-z0-9._-]+$/i.test(value)) {
    return value;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function commandByName(
  commands: readonly GuideCommandEntry[],
  name: string,
): GuideCommandEntry | undefined {
  return commands.find((entry) => entry.name === name);
}

function renderWorkflowReference(commands: readonly GuideCommandEntry[]): string {
  const lines = [
    '# Flujo de trabajo con Gaveta',
    '',
    'Usa este orden al documentar con la CLI. El contrato HTML (elementos, componentes y tipos) vive en `gaveta guide`; aquí solo el flujo.',
    '',
    '## Pasos',
    '',
    ...AGENT_WORKFLOW_BULLETS.map((bullet, index) => `${String(index + 1)}. ${bullet}`),
    '',
    '## Vault fuera del directorio actual',
    '',
    ...AGENT_VAULT_BULLETS.map((bullet) => `- ${bullet}`),
    '',
    '## Comandos de referencia (ejemplos reales)',
    '',
  ];
  for (const name of AGENT_COMMAND_NAMES) {
    const entry = commandByName(commands, name);
    if (entry === undefined) {
      continue;
    }
    lines.push(`### ${entry.name}`);
    lines.push(entry.summary);
    lines.push(`\`${entry.example}\``);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderNoteTypesReference(): string {
  const lines = [
    '# Tipos de nota',
    '',
    'Cada nota tiene `gaveta:type` en el `<head>`. Los ejemplos completos y las reglas estructurales están en `gaveta guide --topic tipos`.',
    '',
    `Tipos disponibles: ${NOTE_TYPES.join(', ')}.`,
    '',
  ];
  for (const type of NOTE_TYPES) {
    const structure = NOTE_TYPE_STRUCTURES[type];
    lines.push(`## ${type}`);
    lines.push(
      'Fragmento mínimo (sin envoltorio html/head). Abre la guía para el documento completo validable.',
    );
    lines.push('');
    lines.push('```html');
    lines.push(structure.example.trim());
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function renderSkillMarkdown(options: SkillBuildOptions): string {
  const description =
    'Documenta un vault de Gaveta con la CLI: buscar, leer contexto, escribir notas HTML enlazadas y validar. Remite a gaveta guide para el contrato.';
  const frontMatter = [
    '---',
    `name: ${SKILL_NAME}`,
    `description: ${yamlScalar(description)}`,
    `${SKILL_CLI_VERSION_FIELD}: ${yamlScalar(options.cliVersion)}`,
    '---',
    '',
  ].join('\n');

  const body = [
    '# Gaveta',
    '',
    'Gaveta es una base de conocimiento local: cada nota es un archivo HTML y los enlaces entre notas son el producto. ' +
      'Los agentes escriben solo con la CLI (`gaveta` o `gv`); no edites el vault a mano ni inventes elementos HTML fuera del contrato.',
    '',
    '## Cuándo usar esta skill',
    '',
    '- El usuario pide documentar, enlazar o mantener notas en un vault de Gaveta.',
    '- Necesitas crear o actualizar conocimiento persistente que otras notas puedan enlazar.',
    '- Debes comprobar enlaces, tareas o la salud del vault antes o después de escribir.',
    '',
    '## Flujo recomendado',
    '',
    ...AGENT_WORKFLOW_BULLETS.map((bullet) => `- ${bullet}`),
    '',
    'Detalle paso a paso: [`references/flujo.md`](references/flujo.md).',
    '',
    '## Salida JSON y escrituras seguras',
    '',
    '- Añade `--json` a los comandos para un sobre estable con `ok`, `data` y avisos.',
    '- Tras `gaveta read` o una escritura, conserva el hash `sha256:…` y pásalo con `--if-match` en `new` o `edit` para no pisar cambios ajenos.',
    '- Pasa HTML largo con `--from -` (stdin) en `new` y `edit`.',
    '',
    '## Vault y directorio de trabajo',
    '',
    ...AGENT_VAULT_BULLETS.map((bullet) => `- ${bullet}`),
    '',
    '## Tipos de nota',
    '',
    `Valores de \`gaveta:type\`: ${NOTE_TYPES.join(', ')}. Resumen y fragmentos: [references/tipos-de-nota.md](references/tipos-de-nota.md).`,
    '',
    '## Contrato de autoría',
    '',
    'No copies tablas de elementos ni listas de componentes en el chat. Ejecuta `gaveta guide` (o `gaveta guide --topic comandos` / `--topic errores`) para la referencia actualizada.',
    '',
  ].join('\n');

  return `${frontMatter}${body}\n`;
}

/** Build the versioned skill bundle shipped under `skills/gaveta/`. */
export function buildSkill(options: SkillBuildOptions): SkillBundle {
  const files: SkillFile[] = [
    { path: 'SKILL.md', contents: renderSkillMarkdown(options) },
    { path: SKILL_REFERENCE_PATHS.workflow, contents: renderWorkflowReference(options.commands) },
    { path: SKILL_REFERENCE_PATHS.noteTypes, contents: renderNoteTypesReference() },
  ];
  return {
    cliVersion: options.cliVersion,
    files,
  };
}
