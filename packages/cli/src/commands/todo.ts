import {
  GavetaError,
  addTaskToNote,
  checkTask,
  exitCodeFor,
  isIso8601,
  isNoteType,
  isTaskPriority,
  listTasks,
  uncheckTask,
  type ListedTask,
  type NoteType,
  type NoteWarning,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const MISSING_REF = 'Falta la referencia.';
const MISSING_TEXT = 'Falta el texto de la tarea.';
const MISSING_TASK = 'Falta el id de la tarea.';
const BAD_TYPE = 'El tipo tiene que ser doc, slides o todo.';
const BAD_TAG = 'La etiqueta no puede estar vacía ni tener espacios alrededor.';
const BAD_HASH = 'El hash de --if-match tiene que ser sha256: y 64 hexadecimales.';
const BAD_FILTER = 'Indica solo una de --open o --done.';
const BAD_DUE = 'La fecha --due tiene que ser ISO 8601.';
const BAD_PRIORITY = 'La prioridad tiene que ser low, medium o high.';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

const sharedWriteOptions = [
  {
    name: 'ifMatch',
    flags: '--if-match <hash>',
    description: 'Rechaza la escritura si el hash no coincide.',
  },
];

const listOptions = [
  {
    name: 'open',
    flags: '--open',
    description: 'Solo tareas pendientes.',
    kind: 'boolean' as const,
  },
  {
    name: 'done',
    flags: '--done',
    description: 'Solo tareas completadas.',
    kind: 'boolean' as const,
  },
  {
    name: 'type',
    flags: '--type <tipo>',
    description: 'Filtra por tipo de nota: doc, slides o todo.',
  },
  { name: 'tag', flags: '--tag <etiqueta>', description: 'Filtra por etiqueta.' },
];

export const todoCommand: CommandSpec = {
  name: 'todo',
  summary: 'Añade, marca o lista tareas en las notas.',
  example: 'gaveta todo add "Tareas" "Comprar leche" --json',
  requiresVault: true,
  input: 'none',
  subcommands: [
    {
      name: 'add',
      summary: 'Añade una tarea a una nota.',
      example: 'gaveta todo add "Tareas" "Comprar leche" --due 2026-10-23 --priority high',
      args: [
        { name: 'ref', description: 'Id, ruta o título de la nota.', required: true },
        { name: 'texto', description: 'Texto de la tarea.', required: true },
      ],
      options: [
        { name: 'section', flags: '--section <id>', description: 'Sección donde añadir la tarea.' },
        { name: 'due', flags: '--due <fecha>', description: 'Fecha límite ISO 8601.' },
        {
          name: 'priority',
          flags: '--priority <prioridad>',
          description: 'Prioridad: low, medium o high.',
        },
        ...sharedWriteOptions,
      ],
      async run(context): Promise<CommandResult> {
        const result = await addTaskToNote(
          withDefined({
            vaultRoot: vaultRoot(context),
            ref: readRef(context),
            text: readText(context),
            section: readSection(context.options.section) ?? undefined,
            due: readDue(context.options.due) ?? undefined,
            priority: readPriority(context.options.priority) ?? undefined,
            ifMatch: readIfMatch(context.options.ifMatch),
          }),
        );
        if (!result.ok) {
          return refused(context, result.warnings);
        }
        return {
          data: {
            id: result.id,
            path: result.path,
            hash: result.hash,
            taskId: result.taskId,
            checked: result.checked,
          },
          human: `Añadida ${result.taskId}\n${result.path}\n${result.hash}\n`,
          warnings: toCommandWarnings(result.warnings),
        };
      },
    },
    {
      name: 'check',
      summary: 'Marca una tarea como hecha.',
      example: 'gaveta todo check "Tareas" revisar',
      args: [
        { name: 'ref', description: 'Id, ruta o título de la nota.', required: true },
        { name: 'task-id', description: 'Id de la tarea.', required: true },
      ],
      options: sharedWriteOptions,
      async run(context): Promise<CommandResult> {
        return presentToggle(await checkTask(toggleInput(context)), context, 'Marcada');
      },
    },
    {
      name: 'uncheck',
      summary: 'Marca una tarea como pendiente.',
      example: 'gaveta todo uncheck "Tareas" revisar',
      args: [
        { name: 'ref', description: 'Id, ruta o título de la nota.', required: true },
        { name: 'task-id', description: 'Id de la tarea.', required: true },
      ],
      options: sharedWriteOptions,
      async run(context): Promise<CommandResult> {
        return presentToggle(await uncheckTask(toggleInput(context)), context, 'Desmarcada');
      },
    },
    {
      name: 'list',
      summary: 'Lista tareas del vault o de una nota.',
      example: 'gaveta todo list --open --json',
      args: [{ name: 'ref', description: 'Id, ruta o título de la nota.', required: false }],
      options: listOptions,
      async run(context): Promise<CommandResult> {
        const open = context.options.open === 'true';
        const done = context.options.done === 'true';
        if (open && done) {
          throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_FILTER });
        }
        const listed = await listTasks(
          withDefined({
            vaultRoot: vaultRoot(context),
            ref: readOptionalRef(context) ?? undefined,
            open: open ? true : undefined,
            done: done ? true : undefined,
            type: readType(context.options.type) ?? undefined,
            tag: readTag(context.options.tag) ?? undefined,
          }),
        );
        return {
          data: { tasks: listed.tasks.map(presentListed) },
          human: renderList(listed.tasks),
          warnings: toCommandWarnings(listed.warnings),
        };
      },
    },
  ],
};

function toggleInput(context: CommandContext): Record<string, unknown> {
  return withDefined({
    vaultRoot: vaultRoot(context),
    ref: readRef(context),
    taskId: readTaskId(context),
    ifMatch: readIfMatch(context.options.ifMatch),
  });
}

function presentToggle(
  result: Awaited<ReturnType<typeof checkTask>>,
  context: CommandContext,
  label: string,
): CommandResult {
  if (!result.ok) {
    return refused(context, result.warnings);
  }
  return {
    data: {
      id: result.id,
      path: result.path,
      hash: result.hash,
      taskId: result.taskId,
      checked: result.checked,
    },
    human: `${label} ${result.taskId}\n${result.path}\n${result.hash}\n`,
    warnings: toCommandWarnings(result.warnings),
  };
}

function presentListed(task: ListedTask): Record<string, unknown> {
  return {
    path: task.path,
    noteId: task.noteId,
    noteTitle: task.noteTitle,
    noteType: task.noteType,
    taskId: task.taskId,
    text: task.text,
    checked: task.checked,
    due: task.due,
    priority: task.priority,
    sectionId: task.sectionId,
  };
}

function renderList(tasks: readonly ListedTask[]): string {
  if (tasks.length === 0) {
    return 'No hay tareas que coincidan.\n';
  }
  return `${tasks
    .map((task) => {
      const state = task.checked ? 'hecha' : 'pendiente';
      const section = task.sectionId === null ? '' : ` · ${task.sectionId}`;
      return `${task.text}\n${task.path} · ${task.taskId ?? 'sin-id'} · ${state}${section}`;
    })
    .join('\n')}\n`;
}

function vaultRoot(context: CommandContext): string {
  if (context.vault === null) {
    throw new GavetaError('E_VAULT_NOT_FOUND');
  }
  return context.vault.root;
}

function readRef(context: CommandContext): string {
  const ref = context.positionals[0];
  if (ref === undefined || ref.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_REF });
  }
  return ref;
}

function readOptionalRef(context: CommandContext): string | null {
  const ref = context.positionals[0];
  if (ref === undefined) {
    return null;
  }
  if (ref.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_REF });
  }
  return ref;
}

function readText(context: CommandContext): string {
  const text = context.positionals[1];
  if (text === undefined || text.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_TEXT });
  }
  return text;
}

function readTaskId(context: CommandContext): string {
  const taskId = context.positionals[1];
  if (taskId === undefined || taskId.trim().length === 0 || /\s/.test(taskId)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_TASK });
  }
  return taskId;
}

function readSection(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (value.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: 'El id de sección no es válido.' });
  }
  return value;
}

function readDue(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (!isIso8601(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_DUE });
  }
  return value;
}

function readPriority(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (!isTaskPriority(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_PRIORITY });
  }
  return value;
}

function readIfMatch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!CONTENT_HASH.test(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_HASH });
  }
  return value;
}

function readType(value: string | undefined): NoteType | null {
  if (value === undefined) {
    return null;
  }
  if (!isNoteType(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TYPE });
  }
  return value;
}

function readTag(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (value.trim().length === 0 || value !== value.trim()) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TAG });
  }
  return value;
}

function refused(context: CommandContext, warnings: readonly NoteWarning[]): CommandResult {
  const escalating = warnings.some(
    (warning) => exitCodeFor(warning.code, context.strictRel ? { strictRel: true } : {}) !== null,
  );
  if (!escalating) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return { data: null, human: '', warnings: toCommandWarnings(warnings) };
}

function withDefined(fields: Record<string, unknown>): Record<string, unknown> {
  const defined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      defined[key] = value;
    }
  }
  return defined;
}

function toCommandWarnings(warnings: readonly NoteWarning[]): CommandWarning[] {
  return warnings.map((warning) => {
    if (Object.keys(warning.params).length === 0) {
      return { code: warning.code };
    }
    return { code: warning.code, params: warning.params };
  });
}
