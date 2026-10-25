import {
  GavetaError,
  linkUnlinkedMentions,
  openVaultIndex,
  unlinkedMentions,
  type UnlinkedMention,
  type VaultIndex,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import { hm } from '../messages.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const MISSING_REF = 'cli.auto.falta_la_referencia';
const BAD_HASH = 'cli.auto.el_hash_de_if_match_tiene_que_ser_sha256_y_64_he';
const BAD_FROM = 'cli.auto.falta_la_nota_de_origen';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

interface MentionView {
  readonly sourcePath: string;
  readonly sourceId: string | null;
  readonly sourceTitle: string;
  readonly text: string;
  readonly phrase: string;
  readonly matchedBy: 'title' | 'alias';
  readonly context: string;
}

export const mentionsCommand: CommandSpec = {
  name: 'mentions',
  summary: 'cli.auto.lista_menciones_no_enlazadas_y_opcionalmente_las',
  example: 'gaveta mentions destino --json',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true }],
  options: [
    {
      name: 'link',
      flags: '--link',
      description: 'cli.auto.convierte_las_menciones_en_enlaces',
      kind: 'boolean',
    },
    {
      name: 'from',
      flags: '--from <origen>',
      description: 'cli.auto.nota_donde_enlazar_solo_con_link',
    },
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'cli.auto.rechaza_la_escritura_si_el_hash_no_coincide',
    },
  ],
  async run(context): Promise<CommandResult> {
    const ref = readRef(context);
    const index = await openIndex(context);
    try {
      const warnings = await ensureIndexed(index);
      if (context.options.link === 'true') {
        const from = readOptionalFrom(context);
        const ifMatches = readIfMatches(context, from);
        const linked = await linkUnlinkedMentions({
          vaultRoot: vaultRoot(context),
          ref,
          ...(from === undefined ? {} : { from }),
          ifMatches,
        });
        const result: CommandResult = {
          data: {
            ref,
            linked: linked.notes,
          },
          human: renderLinked(ref, linked.notes),
        };
        return warnings === undefined ? result : { ...result, warnings };
      }
      const mentions = await unlinkedMentions(vaultRoot(context), index, ref);
      const presented = mentions.map(presentMention);
      const result: CommandResult = {
        data: { ref, mentions: presented },
        human: renderMentions(ref, presented),
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

function readOptionalFrom(context: CommandContext): string | undefined {
  const from = context.options.from;
  if (from === undefined) {
    return undefined;
  }
  if (typeof from !== 'string' || from.includes('\0') || from.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_FROM });
  }
  return from.trim();
}

function readIfMatches(context: CommandContext, from: string | undefined): Record<string, string> {
  const hash = context.options.ifMatch;
  if (hash === undefined) {
    return {};
  }
  if (typeof hash !== 'string' || !CONTENT_HASH.test(hash)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_HASH });
  }
  if (from === undefined) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_FROM });
  }
  return { [from]: hash };
}

function presentMention(mention: UnlinkedMention): MentionView {
  return {
    sourcePath: mention.sourcePath,
    sourceId: mention.sourceId,
    sourceTitle: mention.sourceTitle,
    text: mention.text,
    phrase: mention.phrase,
    matchedBy: mention.matchedBy,
    context: mention.context,
  };
}

function renderMentions(ref: string, mentions: readonly MentionView[]): string {
  if (mentions.length === 0) {
    return hm('cli.human.connections.mentions_none', { ref });
  }
  const lines = mentions
    .map((mention) =>
      hm('cli.human.connections.mentions_line', {
        sourceTitle: mention.sourceTitle,
        sourcePath: mention.sourcePath,
        text: mention.text,
        context: mention.context,
      }),
    )
    .join('\n');
  return hm('cli.human.connections.mentions_header', { count: mentions.length, ref, lines });
}

function renderLinked(
  ref: string,
  notes: readonly { readonly path: string; readonly hash: string; readonly linked: number }[],
): string {
  if (notes.length === 0) {
    return hm('cli.human.connections.mentions_link_none', { ref });
  }
  const lines = notes
    .map((note) =>
      hm('cli.human.connections.mentions_link_line', {
        path: note.path,
        linked: note.linked,
        hash: note.hash,
      }),
    )
    .join('\n');
  return hm('cli.human.connections.mentions_link_header', { ref, lines });
}
