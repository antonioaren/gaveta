import {
  GavetaError,
  convertClaudeHtml,
  createNote,
  editNote,
  exitCodeFor,
  isNoteType,
  readNote,
  type NoteType,
  type CreateNoteResult,
  type EditNoteResult,
  type NoteOutline,
  type NoteWarning,
  type ReadNoteResult,
  type SavedLink,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const BAD_TYPE = 'El tipo tiene que ser doc, slides, todo, dashboard, design o artifact.';
const MISSING_TYPE = 'Falta --type.';
const MISSING_TITLE = 'Falta el título.';
const MISSING_REF = 'Falta la referencia.';
const BAD_AS = 'El formato tiene que ser html, text u outline.';
const BAD_HASH = 'El hash de --if-match tiene que ser sha256: y 64 hexadecimales.';
const MODE_MISSING = 'Indica --replace, --append o --prepend.';
const MODE_ONE = 'Indica solo una de --replace, --append o --prepend.';
const SECTION_REQUIRED = '--append y --prepend necesitan --section.';
const BAD_SECTION = 'El id de sección no es válido.';
const BLANK_EDIT = 'El contenido de la edición no puede estar vacío.';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

type EditMode = 'replace' | 'append' | 'prepend';
type ReadAs = 'html' | 'text' | 'outline';

export const newCommand: CommandSpec = {
  name: 'new',
  summary: 'Crea una nota, completa los metadatos y resuelve los enlaces [[…]].',
  example: 'gaveta new "Usar SQLite" --type doc --in decisiones --from -',
  requiresVault: true,
  input: 'optional',
  args: [{ name: 'título', description: 'Título de la nota.', required: true }],
  options: [
    {
      name: 'type',
      flags: '--type <tipo>',
      description: 'Tipo: doc, slides, todo, dashboard, design o artifact.',
    },
    {
      name: 'source',
      flags: '--source <origen>',
      description: 'Con --from -, convierte HTML de Claude antes de crear la nota.',
      choices: ['claude'],
    },
    {
      name: 'allowCdn',
      flags: '--allow-cdn',
      description: 'Permite CDN en notas artifact importadas desde Claude.',
      kind: 'boolean',
    },
    { name: 'in', flags: '--in <carpeta>', description: 'Carpeta dentro del vault.' },
    { name: 'tags', flags: '--tags <etiquetas>', description: 'Etiquetas separadas por comas.' },
    { name: 'aliases', flags: '--aliases <alias>', description: 'Alias separados por comas.' },
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'Rechaza la escritura si el hash no coincide.',
    },
  ],
  async run(context): Promise<CommandResult> {
    const root = vaultRoot(context);
    const title = readTitle(context);
    const claude = materializeClaudeInput(context, title);
    const created = await createNote(
      withDefined({
        vaultRoot: root,
        title,
        type: claude.type,
        folder: context.options.in,
        tags: splitNames(context.options.tags, 'etiquetas'),
        aliases: splitNames(context.options.aliases, 'alias'),
        html: claude.html,
        ifMatch: readIfMatch(context.options.ifMatch),
        ...(claude.artifactCdn ? { artifactCdn: true } : {}),
      }),
    );
    if (!created.ok) {
      return refused(context, created.warnings);
    }
    return {
      data: presentCreated(created),
      human: `Creada ${created.path}\n${created.id}\n${created.hash}\n`,
      warnings: [...claude.warnings, ...toCommandWarnings(created.warnings)],
    };
  },
};

export const readCommand: CommandSpec = {
  name: 'read',
  summary: 'Lee una nota como html, text u outline y devuelve su hash.',
  example: 'gaveta read "Usar SQLite" --as outline',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'Id, ruta o título de la nota.', required: true }],
  options: [
    {
      name: 'as',
      flags: '--as <formato>',
      description: 'Formato: html, text u outline. Por defecto html.',
    },
  ],
  async run(context): Promise<CommandResult> {
    const note = await readNote({
      vaultRoot: vaultRoot(context),
      ref: readRef(context),
      as: readAs(context.options.as),
    });
    return { data: presentRead(note), human: renderRead(note) };
  },
};

export const editCommand: CommandSpec = {
  name: 'edit',
  summary: 'Sustituye, añade o antepone contenido en una sección o en el artículo.',
  example: 'gaveta edit "Usar SQLite" --section resumen --replace --from -',
  requiresVault: true,
  input: 'required',
  args: [{ name: 'ref', description: 'Id, ruta o título de la nota.', required: true }],
  options: [
    { name: 'section', flags: '--section <id>', description: 'Id de la sección a editar.' },
    {
      name: 'replace',
      flags: '--replace',
      description: 'Sustituye la sección o, sin --section, el artículo.',
      kind: 'boolean',
    },
    {
      name: 'append',
      flags: '--append',
      description: 'Añade el contenido al final de la sección.',
      kind: 'boolean',
    },
    {
      name: 'prepend',
      flags: '--prepend',
      description: 'Añade el contenido al principio de la sección.',
      kind: 'boolean',
    },
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'Rechaza la escritura si el hash no coincide.',
    },
  ],
  async run(context): Promise<CommandResult> {
    const mode = readMode(context.options);
    const edited = await editNote(
      withDefined({
        vaultRoot: vaultRoot(context),
        ref: readRef(context),
        html: readEditBody(context),
        mode,
        section: readSection(context.options.section, mode),
        ifMatch: readIfMatch(context.options.ifMatch),
      }),
    );
    if (!edited.ok) {
      return refused(context, edited.warnings);
    }
    return {
      data: presentEdited(edited),
      human: `Actualizada ${edited.path}\n${edited.hash}\n`,
      warnings: toCommandWarnings(edited.warnings),
    };
  },
};

function vaultRoot(context: CommandContext): string {
  if (context.vault === null) {
    throw new GavetaError('E_VAULT_NOT_FOUND');
  }
  return context.vault.root;
}

function readTitle(context: CommandContext): string {
  const title = context.positionals[0];
  if (title === undefined || title.includes('\0') || title.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_TITLE });
  }
  return title.trim();
}

function readRef(context: CommandContext): string {
  const ref = context.positionals[0];
  if (ref === undefined || ref.includes('\0') || ref.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_REF });
  }
  return ref.trim();
}

function readType(value: string | undefined): NoteType {
  if (value === undefined) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_TYPE });
  }
  if (!isNoteType(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TYPE });
  }
  return value;
}

function readOptionalType(value: string): NoteType {
  if (!isNoteType(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TYPE });
  }
  return value;
}

function materializeClaudeInput(
  context: CommandContext,
  title: string,
): {
  readonly type: NoteType;
  readonly html: string | undefined;
  readonly warnings: readonly CommandWarning[];
  readonly artifactCdn: boolean;
} {
  const typeOption = context.options.type;
  if (context.options.source !== 'claude') {
    return {
      type: readType(typeOption),
      html: context.input?.text,
      warnings: [],
      artifactCdn: false,
    };
  }
  const html = context.input?.text;
  if (html === undefined) {
    throw new CliFailure(
      'E_ARG_INVALID',
      {},
      { problem: 'Indica el HTML con --from - o --from <archivo>.' },
    );
  }
  const explicitType = typeOption === undefined ? undefined : readOptionalType(typeOption);
  const converted = convertClaudeHtml(html, {
    ...(explicitType !== undefined ? { as: explicitType } : {}),
    allowCdn: context.options.allowCdn === 'true',
    title,
  });
  const warnings: CommandWarning[] = converted.warnings.map((warning) =>
    warning.params === undefined
      ? { code: warning.code }
      : { code: warning.code, params: warning.params },
  );
  return {
    type: explicitType ?? converted.type,
    html: converted.body,
    warnings,
    artifactCdn: context.options.allowCdn === 'true' || converted.allowCdn,
  };
}

function readAs(value: string | undefined): ReadAs {
  if (value === undefined) {
    return 'html';
  }
  if (value === 'html' || value === 'text' || value === 'outline') {
    return value;
  }
  throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_AS });
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

function readMode(options: Readonly<Record<string, string>>): EditMode {
  const chosen = (['replace', 'append', 'prepend'] as const).filter(
    (mode) => options[mode] === 'true',
  );
  if (chosen.length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MODE_MISSING });
  }
  if (chosen.length > 1) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MODE_ONE });
  }
  const mode = chosen[0];
  if (mode === undefined) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MODE_MISSING });
  }
  return mode;
}

function readSection(value: string | undefined, mode: EditMode): string | undefined {
  if (value === undefined) {
    if (mode !== 'replace') {
      throw new CliFailure('E_ARG_INVALID', {}, { problem: SECTION_REQUIRED });
    }
    return undefined;
  }
  if (value.trim().length === 0 || value !== value.trim() || value.includes('\0')) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_SECTION });
  }
  return value;
}

function readEditBody(context: CommandContext): string {
  const text = context.input?.text;
  if (text === undefined || text.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BLANK_EDIT });
  }
  return text;
}

function splitNames(value: string | undefined, label: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const names = value.split(',').map((part) => part.trim());
  if (names.some((name) => name.length === 0 || name.includes('\0'))) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: `La lista de ${label} no es válida.` });
  }
  if (new Set(names).size !== names.length) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: `La lista de ${label} tiene repetidos.` });
  }
  return names;
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

function refused(context: CommandContext, warnings: readonly NoteWarning[]): CommandResult {
  const escalating = warnings.some(
    (warning) => exitCodeFor(warning.code, context.strictRel ? { strictRel: true } : {}) !== null,
  );
  if (!escalating) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return { data: null, human: '', warnings: toCommandWarnings(warnings) };
}

function toCommandWarnings(warnings: readonly NoteWarning[]): CommandWarning[] {
  return warnings.map((warning) => {
    if (Object.keys(warning.params).length === 0) {
      return { code: warning.code };
    }
    return { code: warning.code, params: warning.params };
  });
}

function presentCreated(created: Extract<CreateNoteResult, { ok: true }>) {
  return {
    id: created.id,
    path: created.path,
    hash: created.hash,
    title: created.title,
    type: created.type,
    links: presentLinks(created.links),
    promoted: created.promoted.map((note) => ({
      path: note.path,
      anchors: note.anchors.map((anchor) => ({
        pendingTitle: anchor.pendingTitle,
        href: anchor.href,
        text: anchor.text,
        matchedBy: anchor.matchedBy,
      })),
    })),
  };
}

function presentEdited(edited: Extract<EditNoteResult, { ok: true }>) {
  return {
    id: edited.id,
    path: edited.path,
    hash: edited.hash,
    title: edited.title,
    type: edited.type,
    section: edited.section,
    links: presentLinks(edited.links),
  };
}

function presentLinks(links: {
  readonly resolved: readonly SavedLink[];
  readonly pending: readonly SavedLink[];
}): {
  readonly resolved: readonly SavedLink[];
  readonly pending: readonly SavedLink[];
} {
  return {
    resolved: links.resolved.map(presentLink),
    pending: links.pending.map(presentLink),
  };
}

function presentLink(link: SavedLink): SavedLink {
  return {
    kind: link.kind,
    text: link.text,
    title: link.title,
    id: link.id,
    path: link.path,
    href: link.href,
    suggestions: link.suggestions.map((suggestion) => ({
      id: suggestion.id,
      title: suggestion.title,
      path: suggestion.path,
      score: suggestion.score,
    })),
  };
}

function presentRead(note: ReadNoteResult): Record<string, unknown> {
  const base = {
    id: note.id,
    path: note.path,
    title: note.title,
    type: note.type,
    hash: note.hash,
    as: note.as,
  };
  if (note.as === 'html') {
    return { ...base, html: note.html };
  }
  if (note.as === 'text') {
    return { ...base, text: note.text };
  }
  return { ...base, outline: note.outline };
}

function renderRead(note: ReadNoteResult): string {
  const body =
    note.as === 'html' ? note.html : note.as === 'text' ? note.text : renderOutline(note.outline);
  const separated = body.endsWith('\n') ? body : `${body}\n`;
  return `${separated}${note.hash}\n`;
}

function renderOutline(outline: NoteOutline): string {
  const lines: string[] = [];
  for (const section of outline.sections) {
    lines.push(renderSection(section, 0));
  }
  if (outline.tasks.length > 0) {
    lines.push('Tareas:');
    for (const task of outline.tasks) {
      const mark = task.checked ? 'x' : ' ';
      const id = task.id === null ? '' : ` (${task.id})`;
      lines.push(`- [${mark}] ${task.text}${id}`);
    }
  }
  if (outline.links.length > 0) {
    lines.push('Enlaces:');
    for (const link of outline.links) {
      lines.push(`- ${link.text}`);
    }
  }
  return lines.join('\n');
}

function renderSection(section: NoteOutline['sections'][number], depth: number): string {
  const pad = '  '.repeat(depth);
  const heading = section.heading ?? section.text;
  const id = section.id === null ? '' : ` (${section.id})`;
  const lines = [`${pad}${heading}${id}`];
  for (const child of section.children) {
    lines.push(renderSection(child, depth + 1));
  }
  return lines.join('\n');
}
