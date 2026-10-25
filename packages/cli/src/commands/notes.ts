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
import { hm } from '../messages.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const BAD_TYPE = 'cli.auto.el_tipo_tiene_que_ser_doc_slides_todo_dashboard_';
const MISSING_TYPE = 'cli.auto.falta_type';
const MISSING_TITLE = 'cli.auto.falta_el_titulo';
const MISSING_REF = 'cli.auto.falta_la_referencia';
const BAD_AS = 'cli.auto.el_formato_tiene_que_ser_html_text_u_outline';
const BAD_HASH = 'cli.auto.el_hash_de_if_match_tiene_que_ser_sha256_y_64_he';
const MODE_MISSING = 'cli.auto.indica_replace_append_o_prepend';
const MODE_ONE = 'cli.auto.indica_solo_una_de_replace_append_o_prepend';
const SECTION_REQUIRED = 'cli.auto.append_y_prepend_necesitan_section';
const BAD_SECTION = 'cli.auto.el_id_de_seccion_no_es_valido';
const BLANK_EDIT = 'cli.auto.el_contenido_de_la_edicion_no_puede_estar_vacio';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

type EditMode = 'replace' | 'append' | 'prepend';
type ReadAs = 'html' | 'text' | 'outline';

export const newCommand: CommandSpec = {
  name: 'new',
  summary: 'cli.auto.crea_una_nota_completa_los_metadatos_y_resuelve_',
  example: 'gaveta new "Usar SQLite" --type doc --in decisiones --from -',
  requiresVault: true,
  input: 'optional',
  args: [{ name: 'titulo', description: 'cli.auto.titulo_de_la_nota', required: true }],
  options: [
    {
      name: 'type',
      flags: '--type <tipo>',
      description: 'cli.auto.tipo_doc_slides_todo_dashboard_design_o_artifact',
    },
    {
      name: 'source',
      flags: '--source <origen>',
      description: 'cli.auto.con_from_convierte_html_de_claude_antes_de_crear',
      choices: ['claude'],
    },
    {
      name: 'allowCdn',
      flags: '--allow-cdn',
      description: 'cli.auto.permite_cdn_en_notas_artifact_importadas_desde_c',
      kind: 'boolean',
    },
    { name: 'in', flags: '--in <carpeta>', description: 'cli.auto.carpeta_dentro_del_vault' },
    {
      name: 'tags',
      flags: '--tags <etiquetas>',
      description: 'cli.auto.etiquetas_separadas_por_comas',
    },
    {
      name: 'aliases',
      flags: '--aliases <alias>',
      description: 'cli.auto.alias_separados_por_comas',
    },
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'cli.auto.rechaza_la_escritura_si_el_hash_no_coincide',
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
      human: hm('cli.human.note.created', {
        path: created.path,
        id: created.id,
        hash: created.hash,
      }),
      warnings: [...claude.warnings, ...toCommandWarnings(created.warnings)],
    };
  },
};

export const readCommand: CommandSpec = {
  name: 'read',
  summary: 'cli.auto.lee_una_nota_como_html_text_u_outline_y_devuelve',
  example: 'gaveta read "Usar SQLite" --as outline',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true }],
  options: [
    {
      name: 'as',
      flags: '--as <formato>',
      description: 'cli.auto.formato_html_text_u_outline_por_defecto_html',
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
  summary: 'cli.auto.sustituye_anade_o_antepone_contenido_en_una_secc',
  example: 'gaveta edit "Usar SQLite" --section resumen --replace --from -',
  requiresVault: true,
  input: 'required',
  args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true }],
  options: [
    { name: 'section', flags: '--section <id>', description: 'cli.auto.id_de_la_seccion_a_editar' },
    {
      name: 'replace',
      flags: '--replace',
      description: 'cli.auto.sustituye_la_seccion_o_sin_section_el_articulo',
      kind: 'boolean',
    },
    {
      name: 'append',
      flags: '--append',
      description: 'cli.auto.anade_el_contenido_al_final_de_la_seccion',
      kind: 'boolean',
    },
    {
      name: 'prepend',
      flags: '--prepend',
      description: 'cli.auto.anade_el_contenido_al_principio_de_la_seccion',
      kind: 'boolean',
    },
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'cli.auto.rechaza_la_escritura_si_el_hash_no_coincide',
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
      human: hm('cli.human.note.updated', { path: edited.path, hash: edited.hash }),
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
      { problem: 'cli.auto.indica_el_html_con_from_o_from_archivo' },
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
    throw new CliFailure(
      'E_ARG_INVALID',
      {},
      { problem: hm('cli.human.meta.list_invalid', { label }) },
    );
  }
  if (new Set(names).size !== names.length) {
    throw new CliFailure(
      'E_ARG_INVALID',
      {},
      { problem: hm('cli.human.meta.list_duplicates', { label }) },
    );
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

export function toCommandWarnings(warnings: readonly NoteWarning[]): CommandWarning[] {
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
    lines.push(hm('cli.human.note.outline_tasks'));
    for (const task of outline.tasks) {
      const mark = task.checked ? 'x' : ' ';
      const id = task.id === null ? '' : ` (${task.id})`;
      lines.push(`- [${mark}] ${task.text}${id}`);
    }
  }
  if (outline.links.length > 0) {
    lines.push(hm('cli.human.note.outline_links'));
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
