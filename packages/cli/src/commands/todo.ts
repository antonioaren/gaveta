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
import { hm } from '../messages.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const MISSING_REF = 'cli.auto.falta_la_referencia';
const MISSING_TEXT = 'cli.auto.falta_el_texto_de_la_tarea';
const MISSING_TASK = 'cli.auto.falta_el_id_de_la_tarea';
const BAD_TYPE = 'cli.auto.el_tipo_tiene_que_ser_doc_slides_o_todo';
const BAD_TAG = 'cli.auto.la_etiqueta_no_puede_estar_vacia_ni_tener_espaci';
const BAD_HASH = 'cli.auto.el_hash_de_if_match_tiene_que_ser_sha256_y_64_he';
const BAD_FILTER = 'cli.auto.indica_solo_una_de_open_o_done';
const BAD_DUE = 'cli.auto.la_fecha_due_tiene_que_ser_iso_8601';
const BAD_PRIORITY = 'cli.auto.la_prioridad_tiene_que_ser_low_medium_o_high';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

const sharedWriteOptions = [
  {
    name: 'ifMatch',
    flags: '--if-match <hash>',
    description: 'cli.auto.rechaza_la_escritura_si_el_hash_no_coincide',
  },
];

const listOptions = [
  {
    name: 'open',
    flags: '--open',
    description: 'cli.auto.solo_tareas_pendientes',
    kind: 'boolean' as const,
  },
  {
    name: 'done',
    flags: '--done',
    description: 'cli.auto.solo_tareas_completadas',
    kind: 'boolean' as const,
  },
  {
    name: 'type',
    flags: '--type <tipo>',
    description: 'cli.auto.filtra_por_tipo_de_nota_doc_slides_o_todo',
  },
  { name: 'tag', flags: '--tag <etiqueta>', description: 'cli.auto.filtra_por_etiqueta' },
];

export const todoCommand: CommandSpec = {
  name: 'todo',
  summary: 'cli.auto.anade_marca_o_lista_tareas_en_las_notas',
  example: 'gaveta todo add "Tareas" "Comprar leche" --json',
  requiresVault: true,
  input: 'none',
  subcommands: [
    {
      name: 'add',
      summary: 'cli.auto.anade_una_tarea_a_una_nota',
      example: 'gaveta todo add "Tareas" "Comprar leche" --due 2026-10-23 --priority high',
      args: [
        { name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true },
        { name: 'texto', description: 'cli.auto.texto_de_la_tarea', required: true },
      ],
      options: [
        {
          name: 'section',
          flags: '--section <id>',
          description: 'cli.auto.seccion_donde_anadir_la_tarea',
        },
        { name: 'due', flags: '--due <fecha>', description: 'cli.auto.fecha_limite_iso_8601' },
        {
          name: 'priority',
          flags: '--priority <prioridad>',
          description: 'cli.auto.prioridad_low_medium_o_high',
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
          human: hm('cli.human.todo.added', {
            taskId: result.taskId,
            path: result.path,
            hash: result.hash,
          }),
          warnings: toCommandWarnings(result.warnings),
        };
      },
    },
    {
      name: 'check',
      summary: 'cli.auto.marca_una_tarea_como_hecha',
      example: 'gaveta todo check "Tareas" revisar',
      args: [
        { name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true },
        { name: 'task-id', description: 'cli.auto.id_de_la_tarea', required: true },
      ],
      options: sharedWriteOptions,
      async run(context): Promise<CommandResult> {
        return presentToggle(
          await checkTask(toggleInput(context)),
          context,
          hm('cli.human.todo.marked'),
        );
      },
    },
    {
      name: 'uncheck',
      summary: 'cli.auto.marca_una_tarea_como_pendiente',
      example: 'gaveta todo uncheck "Tareas" revisar',
      args: [
        { name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true },
        { name: 'task-id', description: 'cli.auto.id_de_la_tarea', required: true },
      ],
      options: sharedWriteOptions,
      async run(context): Promise<CommandResult> {
        return presentToggle(
          await uncheckTask(toggleInput(context)),
          context,
          hm('cli.human.todo.unmarked'),
        );
      },
    },
    {
      name: 'list',
      summary: 'cli.auto.lista_tareas_del_vault_o_de_una_nota',
      example: 'gaveta todo list --open --json',
      args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: false }],
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
    human: hm('cli.human.todo.toggle_line', {
      label,
      taskId: result.taskId,
      path: result.path,
      hash: result.hash,
    }),
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
    return hm('cli.human.todo.list_empty');
  }
  return `${tasks
    .map((task) => {
      const state = task.checked
        ? hm('cli.human.todo.state_done')
        : hm('cli.human.todo.state_open');
      const section = task.sectionId === null ? '' : ` · ${task.sectionId}`;
      return hm('cli.human.todo.list_item', {
        text: task.text,
        path: task.path,
        taskId: task.taskId ?? hm('cli.human.todo.no_id'),
        state,
        section,
      }).trimEnd();
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
    throw new CliFailure(
      'E_ARG_INVALID',
      {},
      { problem: 'cli.auto.el_id_de_seccion_no_es_valido' },
    );
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
