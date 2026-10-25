import {
  editNoteMeta,
  GavetaError,
  readNote,
  requireNoteContentHash,
  type NoteWarning,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import type { CommandContext, CommandResult, CommandSpec } from '../types.ts';
import { toCommandWarnings } from './notes.ts';

const MISSING_REF = 'cli.auto.falta_la_referencia';
const BAD_HASH = 'cli.auto.el_hash_de_if_match_tiene_que_ser_sha256_y_64_he';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

export const metaCommand: CommandSpec = {
  name: 'meta',
  summary: 'cli.auto.edita_las_etiquetas_y_los_alias_de_una_nota',
  example: 'gaveta meta "Nota X" --tags indice,sql --if-match sha256:…',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true }],
  options: [
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
    const ref = readRef(context);
    const hasTags = context.options.tags !== undefined;
    const hasAliases = context.options.aliases !== undefined;
    if (!hasTags && !hasAliases) {
      throw new CliFailure('E_ARG_INVALID', {}, { problem: 'cli.auto.indica_tags_o_aliases' });
    }
    const ifMatch = readIfMatch(context.options.ifMatch);
    await assertIfMatch(root, ref, ifMatch);
    const edited = await editNoteMeta({
      vaultRoot: root,
      ref,
      ...(hasTags ? { tags: splitNames(context.options.tags, 'etiquetas') } : {}),
      ...(hasAliases ? { aliases: splitNames(context.options.aliases, 'alias') } : {}),
      ifMatch,
    });
    if (!edited.ok) {
      return refused(edited.warnings);
    }
    return {
      data: {
        id: edited.id,
        path: edited.path,
        hash: edited.hash,
        title: edited.title,
        type: edited.type,
      },
      human: `Metadatos actualizados en ${edited.path}\n${edited.hash}\n`,
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

function readRef(context: CommandContext): string {
  const ref = context.positionals[0];
  if (ref === undefined || ref.includes('\0') || ref.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_REF });
  }
  return ref.trim();
}

function readIfMatch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!CONTENT_HASH.test(trimmed)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_HASH });
  }
  return trimmed;
}

async function assertIfMatch(
  vaultRoot: string,
  ref: string,
  ifMatch: string | undefined,
): Promise<void> {
  const note = await readNote({ vaultRoot, ref, as: 'html' });
  requireNoteContentHash(note.hash, ifMatch);
}

function splitNames(value: string | undefined, label: string): string[] {
  if (value === undefined) {
    return [];
  }
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: `Faltan ${label} válidos.` });
  }
  for (const part of parts) {
    if (part.includes('\0')) {
      throw new CliFailure('E_ARG_INVALID', {}, { problem: `Faltan ${label} válidos.` });
    }
  }
  if (new Set(parts).size !== parts.length) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: `Hay ${label} duplicados.` });
  }
  return parts;
}

function refused(warnings: readonly NoteWarning[]): CommandResult {
  return {
    data: { refused: true },
    human: 'La nota no se guardó por avisos del validador.\n',
    warnings: toCommandWarnings(warnings),
    exitCode: 2,
  };
}
