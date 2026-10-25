import {
  GavetaError,
  GRAPH_DEPTH_MAX,
  GRAPH_DEPTH_MIN,
  backlinks,
  exitCodeFor,
  globalGraph,
  isNoteType,
  linkNote,
  localGraph,
  openVaultIndex,
  outgoingLinks,
  type Backlink,
  type Graph,
  type GraphFilters,
  type NoteType,
  type NoteWarning,
  type OutgoingLink,
  type VaultIndex,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const MISSING_REF = 'cli.auto.falta_la_referencia';
const MISSING_FROM = 'cli.auto.falta_la_nota_de_origen';
const MISSING_TO = 'cli.auto.falta_la_nota_de_destino';
const BAD_TYPE = 'cli.auto.el_tipo_no_es_un_tipo_de_nota_valido';
const BAD_TAG = 'cli.auto.la_etiqueta_no_puede_estar_vacia_ni_tener_espaci';
const BAD_REL = 'cli.auto.el_rel_no_puede_estar_vacio';
const BAD_DEPTH = 'cli.auto.la_profundidad_tiene_que_ser_un_entero_entre_1_y';
const BAD_DEPTH_WITHOUT_REF = 'cli.auto.la_profundidad_solo_aplica_con_una_referencia';
const BAD_REF_WITHOUT_DEPTH = 'cli.auto.indica_depth_entre_1_y_3_para_el_grafo_local';
const BAD_HASH = 'cli.auto.el_hash_de_if_match_tiene_que_ser_sha256_y_64_he';
const BAD_TEXT = 'cli.auto.el_texto_del_enlace_no_puede_estar_vacio';
const BAD_SECTION = 'cli.auto.el_id_de_seccion_no_es_valido';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

interface LinkTargetView {
  readonly id: string | null;
  readonly path: string | null;
  readonly title: string;
  readonly ghost: boolean;
}

interface OutgoingLinkView {
  readonly target: LinkTargetView;
  readonly rel: string | null;
  readonly text: string;
  readonly section: string | null;
}

interface BacklinkView {
  readonly sourcePath: string;
  readonly sourceId: string | null;
  readonly sourceTitle: string;
  readonly rel: string | null;
  readonly text: string;
  readonly section: string | null;
  readonly context: string;
}

interface GraphNodeView {
  readonly id: string | null;
  readonly title: string;
  readonly type: NoteType | null;
  readonly tags: readonly string[];
  readonly path: string | null;
  readonly ghost: boolean;
}

interface GraphEdgeView {
  readonly from: string;
  readonly to: string;
  readonly rel: string | null;
}

export const linksCommand: CommandSpec = {
  name: 'links',
  summary: 'cli.auto.lista_los_enlaces_salientes_de_una_nota',
  example: 'gaveta links "Usar SQLite" --json',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true }],
  options: [],
  async run(context): Promise<CommandResult> {
    const ref = readRef(context);
    const index = await openIndex(context);
    try {
      const warnings = await ensureIndexed(index);
      const links = outgoingLinks(index, ref).map(presentOutgoing);
      const result: CommandResult = {
        data: { ref, links },
        human: renderOutgoing(ref, links),
      };
      return warnings === undefined ? result : { ...result, warnings };
    } finally {
      index.close();
    }
  },
};

export const backlinksCommand: CommandSpec = {
  name: 'backlinks',
  summary: 'cli.auto.lista_los_enlaces_entrantes_con_el_contexto_dond',
  example: 'gaveta backlinks "Usar SQLite" --json',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true }],
  options: [],
  async run(context): Promise<CommandResult> {
    const ref = readRef(context);
    const index = await openIndex(context);
    try {
      const warnings = await ensureIndexed(index);
      const incoming = backlinks(index, ref).map(presentBacklink);
      const result: CommandResult = {
        data: { ref, backlinks: incoming },
        human: renderBacklinks(ref, incoming),
      };
      return warnings === undefined ? result : { ...result, warnings };
    } finally {
      index.close();
    }
  },
};

export const linkCommand: CommandSpec = {
  name: 'link',
  summary: 'cli.auto.anade_un_enlace_canonico_entre_dos_notas_sin_edi',
  example: 'gaveta link origen destino --rel related --json',
  requiresVault: true,
  input: 'none',
  args: [
    { name: 'origen', description: 'cli.auto.nota_que_enlazara', required: true },
    { name: 'destino', description: 'cli.auto.nota_destino_del_enlace', required: true },
  ],
  options: [
    { name: 'rel', flags: '--rel <rel>', description: 'cli.auto.valor_de_rel_en_el_ancla' },
    { name: 'text', flags: '--text <texto>', description: 'cli.auto.texto_visible_del_enlace' },
    {
      name: 'section',
      flags: '--section <id>',
      description: 'cli.auto.seccion_donde_insertar_el_enlace',
    },
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'cli.auto.rechaza_la_escritura_si_el_hash_no_coincide',
    },
  ],
  async run(context): Promise<CommandResult> {
    const from = readFrom(context);
    const to = readTo(context);
    const linked = await linkNote(
      withDefined({
        vaultRoot: vaultRoot(context),
        from,
        to,
        ...(context.options.rel === undefined ? {} : { rel: readRel(context.options.rel) }),
        ...(context.options.text === undefined ? {} : { text: readLinkText(context.options.text) }),
        ...(context.options.section === undefined
          ? {}
          : { section: readLinkSection(context.options.section) }),
        ...(context.options.ifMatch === undefined
          ? {}
          : { ifMatch: readIfMatch(context.options.ifMatch) }),
      }),
    );
    if (!linked.ok) {
      return refused(context, linked.warnings);
    }
    const verb = linked.added ? 'Enlazada' : 'Sin cambios';
    return {
      data: {
        id: linked.id,
        path: linked.path,
        hash: linked.hash,
        title: linked.title,
        type: linked.type,
        section: linked.section,
        added: linked.added,
        links: presentSavedLinks(linked.links),
      },
      human: `${verb} ${linked.path} → ${to}\n${linked.hash}\n`,
      warnings: toCommandWarnings(linked.warnings),
    };
  },
};

export const graphCommand: CommandSpec = {
  name: 'graph',
  summary: 'cli.auto.muestra_el_grafo_global_o_local_de_notas_y_enlac',
  example: 'gaveta graph --json',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'cli.auto.centro_del_grafo_local', required: false }],
  options: [
    {
      name: 'depth',
      flags: '--depth <n>',
      description: 'cli.auto.profundidad_del_grafo_local_entre_1_y_3',
    },
    {
      name: 'type',
      flags: '--type <tipo>',
      description: 'cli.auto.filtra_por_tipo_doc_slides_o_todo',
    },
    { name: 'tag', flags: '--tag <etiqueta>', description: 'cli.auto.filtra_por_una_etiqueta' },
    { name: 'rel', flags: '--rel <rel>', description: 'cli.auto.filtra_por_rel_en_las_aristas' },
  ],
  async run(context): Promise<CommandResult> {
    const ref = readOptionalRef(context);
    if (ref === undefined) {
      rejectDepthWithoutRef(context.options.depth);
    }
    const filters = readGraphFilters(context);
    const index = await openIndex(context);
    try {
      const warnings = await ensureIndexed(index);
      let graph: Graph;
      let depth: number | undefined;
      if (ref === undefined) {
        graph = globalGraph(index, filters);
      } else {
        depth = readLocalDepth(context.options.depth);
        graph = localGraph(index, ref, { depth, ...filters });
      }
      const data = presentGraph(ref, depth, filters, graph);
      const result: CommandResult = {
        data,
        human: renderGraph(data),
      };
      return warnings === undefined ? result : { ...result, warnings };
    } finally {
      index.close();
    }
  },
};

function vaultRoot(context: CommandContext): string {
  if (context.vault === null) {
    throw new GavetaError('E_VAULT_NOT_FOUND');
  }
  return context.vault.root;
}

async function openIndex(context: CommandContext): Promise<VaultIndex> {
  return openVaultIndex(vaultRoot(context));
}

async function ensureIndexed(index: VaultIndex): Promise<readonly CommandWarning[] | undefined> {
  const recovered = index.recovery();
  if (recovered !== null || index.notes().length === 0) {
    await index.rebuild();
  }
  if (recovered === null) {
    return undefined;
  }
  return [{ code: 'W_INDEX_RECOVERED' }];
}

function readRef(context: CommandContext): string {
  const ref = context.positionals[0];
  if (ref === undefined || ref.includes('\0') || ref.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_REF });
  }
  return ref.trim();
}

function readOptionalRef(context: CommandContext): string | undefined {
  const ref = context.positionals[0];
  if (ref === undefined) {
    return undefined;
  }
  if (ref.includes('\0') || ref.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_REF });
  }
  return ref.trim();
}

function readFrom(context: CommandContext): string {
  const from = context.positionals[0];
  if (from === undefined || from.includes('\0') || from.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_FROM });
  }
  return from.trim();
}

function readTo(context: CommandContext): string {
  const to = context.positionals[1];
  if (to === undefined || to.includes('\0') || to.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_TO });
  }
  return to.trim();
}

function readRel(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (value.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_REL });
  }
  return value.trim();
}

function readLinkText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TEXT });
  }
  return value;
}

function readLinkSection(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0 || value !== value.trim()) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_SECTION });
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

function readLocalDepth(value: string | undefined): number {
  if (value === undefined) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_REF_WITHOUT_DEPTH });
  }
  if (!/^[1-3]$/u.test(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_DEPTH });
  }
  const depth = Number(value);
  if (depth < GRAPH_DEPTH_MIN || depth > GRAPH_DEPTH_MAX) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_DEPTH });
  }
  return depth;
}

function rejectDepthWithoutRef(value: string | undefined): void {
  if (value !== undefined) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_DEPTH_WITHOUT_REF });
  }
}

function readGraphFilters(context: CommandContext): GraphFilters {
  const filters: { type?: NoteType; tag?: string; rel?: string } = {};
  const type = readGraphType(context.options.type);
  if (type !== undefined) {
    filters.type = type;
  }
  const tag = readGraphTag(context.options.tag);
  if (tag !== undefined) {
    filters.tag = tag;
  }
  const rel = readGraphRel(context.options.rel);
  if (rel !== undefined) {
    filters.rel = rel;
  }
  return filters;
}

function readGraphType(value: string | undefined): NoteType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isNoteType(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TYPE });
  }
  return value;
}

function readGraphTag(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0 || value !== value.trim()) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TAG });
  }
  return value;
}

function readGraphRel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_REL });
  }
  return value.trim();
}

function presentOutgoing(link: OutgoingLink): OutgoingLinkView {
  return {
    target: {
      id: link.target.id,
      path: link.target.path,
      title: link.target.title,
      ghost: link.target.ghost,
    },
    rel: link.rel,
    text: link.text,
    section: link.sectionId,
  };
}

function presentBacklink(link: Backlink): BacklinkView {
  return {
    sourcePath: link.sourcePath,
    sourceId: link.sourceId,
    sourceTitle: link.sourceTitle,
    rel: link.rel,
    text: link.text,
    section: link.sectionId,
    context: link.context,
  };
}

function presentGraph(
  ref: string | undefined,
  depth: number | undefined,
  filters: GraphFilters,
  graph: Graph,
): {
  readonly ref: string | null;
  readonly depth: number | null;
  readonly type: NoteType | null;
  readonly tag: string | null;
  readonly rel: string | null;
  readonly nodes: readonly GraphNodeView[];
  readonly edges: readonly GraphEdgeView[];
} {
  return {
    ref: ref ?? null,
    depth: depth ?? null,
    type: filters.type ?? null,
    tag: filters.tag ?? null,
    rel: filters.rel ?? null,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      tags: [...node.tags],
      path: node.path,
      ghost: node.ghost,
    })),
    edges: graph.edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      rel: edge.rel,
    })),
  };
}

function renderOutgoing(ref: string, links: readonly OutgoingLinkView[]): string {
  if (links.length === 0) {
    return `Sin enlaces salientes en ${ref}.\n`;
  }
  const lines = links.map((link) => {
    const target = link.target.ghost
      ? `${link.target.title} (fantasma)`
      : (link.target.path ?? link.target.title);
    const section = link.section === null ? '' : ` @${link.section}`;
    const rel = link.rel === null ? '' : ` [${link.rel}]`;
    return `- ${link.text} → ${target}${rel}${section}`;
  });
  return `${String(links.length)} enlace(s) desde ${ref}\n${lines.join('\n')}\n`;
}

function renderBacklinks(ref: string, incoming: readonly BacklinkView[]): string {
  if (incoming.length === 0) {
    return `Sin backlinks en ${ref}.\n`;
  }
  const lines = incoming.map((link) => {
    const rel = link.rel === null ? '' : ` [${link.rel}]`;
    return `- ${link.sourceTitle} (${link.sourcePath})${rel}: ${link.context}`;
  });
  return `${String(incoming.length)} backlink(s) en ${ref}\n${lines.join('\n')}\n`;
}

function renderGraph(data: {
  readonly ref: string | null;
  readonly nodes: readonly GraphNodeView[];
  readonly edges: readonly GraphEdgeView[];
}): string {
  const scope = data.ref === null ? 'global' : `local (${data.ref})`;
  const ghosts = data.nodes.filter((node) => node.ghost).length;
  return `Grafo ${scope}: ${String(data.nodes.length)} nodo(s), ${String(data.edges.length)} arista(s), ${String(ghosts)} fantasma(s).\n`;
}

function presentSavedLinks(links: {
  readonly resolved: readonly {
    readonly text: string;
    readonly id: string | null;
    readonly path: string | null;
    readonly href: string | null;
  }[];
  readonly pending: readonly { readonly title: string }[];
}) {
  return {
    resolved: links.resolved.map((link) => ({
      text: link.text,
      id: link.id,
      path: link.path,
      href: link.href,
    })),
    pending: links.pending.map((link) => ({ title: link.title })),
  };
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
