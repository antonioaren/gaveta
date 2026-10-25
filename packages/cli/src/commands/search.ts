import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_SNIPPET_END,
  SEARCH_SNIPPET_START,
  GavetaError,
  isNoteType,
  openVaultIndex,
  type NoteType,
  type SearchHit,
  type SearchOptions,
  type VaultIndex,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import { hm, m } from '../messages.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const EMPTY_QUERY = 'cli.auto.la_consulta_no_puede_estar_vacia';
const BAD_TYPE = 'cli.auto.el_tipo_tiene_que_ser_doc_slides_o_todo';
const BAD_TAG = 'cli.auto.la_etiqueta_no_puede_estar_vacia_ni_tener_espaci';
const BAD_LIMIT = 'cli.auto.el_limite_tiene_que_ser_un_entero_entre_1_y_100';
const EMPTY_HITS = 'cli.auto.no_hay_notas_que_coincidan';

interface SearchHitView {
  readonly path: string;
  readonly id: string | null;
  readonly title: string;
  readonly type: NoteType | null;
  readonly tags: readonly string[];
  readonly snippet: string;
}

interface SearchRequest {
  readonly query: string;
  readonly type: NoteType | null;
  readonly tag: string | null;
  readonly limit: number;
  readonly search: SearchOptions;
}

export const searchCommand: CommandSpec = {
  name: 'search',
  summary: 'cli.auto.busca_texto_en_el_titulo_los_alias_los_encabezad',
  example: 'gaveta search "base de datos" --json',
  requiresVault: true,
  input: 'none',
  args: [
    {
      name: 'consulta',
      description: 'cli.auto.texto_a_buscar',
      required: true,
    },
  ],
  options: [
    {
      name: 'type',
      flags: '--type <tipo>',
      description: 'cli.auto.filtra_por_tipo_doc_slides_o_todo',
    },
    {
      name: 'tag',
      flags: '--tag <etiqueta>',
      description: 'cli.auto.filtra_por_una_etiqueta',
    },
    {
      name: 'limit',
      flags: '--limit <n>',
      description: 'cli.auto.maximo_de_resultados_entre_1_y_100',
    },
  ],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const request = readSearchRequest(context);
    const index = await openVaultIndex(context.vault.root);
    try {
      const warnings = await ensureIndexed(index);
      const hits = index.search(quoteFtsQuery(request.query), request.search).map(presentHit);
      const result: CommandResult = {
        data: {
          query: request.query,
          type: request.type,
          tag: request.tag,
          limit: request.limit,
          hits,
        },
        human: renderHuman(hits),
      };
      if (warnings === undefined) {
        return result;
      }
      return { ...result, warnings };
    } finally {
      index.close();
    }
  },
};

/**
 * Quote the whole query as one FTS5 phrase.
 * Operators, hyphens, and broken MATCH syntax stay literal text.
 */
function quoteFtsQuery(query: string): string {
  return `"${query.replaceAll('"', '""')}"`;
}

function readSearchRequest(context: CommandContext): SearchRequest {
  const rawQuery = context.positionals[0];
  if (rawQuery === undefined || rawQuery.includes('\0') || rawQuery.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: EMPTY_QUERY });
  }
  const type = readType(context.options.type);
  const tag = readTag(context.options.tag);
  const limit = readLimit(context.options.limit);
  return {
    query: rawQuery.trim(),
    type: type ?? null,
    tag: tag ?? null,
    limit: limit ?? SEARCH_DEFAULT_LIMIT,
    search: toSearchOptions(type, tag, limit),
  };
}

function readType(value: string | undefined): NoteType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isNoteType(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TYPE });
  }
  return value;
}

function readTag(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0 || value !== value.trim()) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_TAG });
  }
  return value;
}

function readLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_LIMIT });
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_LIMIT });
  }
  return limit;
}

function toSearchOptions(
  type: NoteType | undefined,
  tag: string | undefined,
  limit: number | undefined,
): SearchOptions {
  const options: { type?: NoteType; tag?: string; limit?: number } = {};
  if (type !== undefined) {
    options.type = type;
  }
  if (tag !== undefined) {
    options.tag = tag;
  }
  if (limit !== undefined) {
    options.limit = limit;
  }
  return options;
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

function presentHit(hit: SearchHit): SearchHitView {
  return {
    path: hit.path,
    id: hit.id,
    title: hit.title,
    type: hit.type,
    tags: hit.tags,
    snippet: presentSnippet(hit.snippet),
  };
}

/** Keep the FTS highlight markers and escape every other markup character. */
function presentSnippet(snippet: string): string {
  let result = '';
  let index = 0;
  while (index < snippet.length) {
    if (snippet.startsWith(SEARCH_SNIPPET_START, index)) {
      result += SEARCH_SNIPPET_START;
      index += SEARCH_SNIPPET_START.length;
      continue;
    }
    if (snippet.startsWith(SEARCH_SNIPPET_END, index)) {
      result += SEARCH_SNIPPET_END;
      index += SEARCH_SNIPPET_END.length;
      continue;
    }
    const char = snippet[index];
    if (char === undefined) {
      break;
    }
    result += escapeHtmlChar(char);
    index += 1;
  }
  return result;
}

function escapeHtmlChar(char: string): string {
  switch (char) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    case '>':
      return '&gt;';
    case '"':
      return '&quot;';
    case "'":
      return '&#39;';
    default:
      return char;
  }
}

function renderHuman(hits: readonly SearchHitView[]): string {
  if (hits.length === 0) {
    return m(EMPTY_HITS);
  }
  return `${hits.map((hit) => renderHit(hit)).join('\n')}\n`;
}

function renderHit(hit: SearchHitView): string {
  const kind = hit.type ?? hm('cli.human.search.no_type');
  const tags = hit.tags.length === 0 ? '' : ` · ${hit.tags.join(', ')}`;
  return hm('cli.human.search.hit_line', {
    title: hit.title,
    path: hit.path,
    kind,
    tags,
    snippet: hit.snippet,
  });
}
