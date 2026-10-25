import {
  GavetaError,
  moveNote,
  openVaultIndex,
  parseNoteContentHash,
  readNote,
  removeNote,
  requireNoteContentHash,
  type MoveNoteResult,
  type RemoveNoteResult,
  type VaultIndex,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import { hm } from '../messages.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const MISSING_REF = 'cli.auto.falta_la_referencia';
const MISSING_DEST = 'cli.auto.falta_el_destino';
const BAD_HASH = 'cli.auto.el_hash_de_if_match_tiene_que_ser_sha256_y_64_he';

export const mvCommand: CommandSpec = {
  name: 'mv',
  summary: 'cli.auto.mueve_o_renombra_una_nota_y_reescribe_los_enlace',
  example: 'gaveta mv "Nota X" otra/carpeta/ --json',
  requiresVault: true,
  input: 'none',
  args: [
    { name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true },
    {
      name: 'destino',
      description: 'cli.auto.ruta_o_carpeta_de_destino_dentro_del_vault',
      required: true,
    },
  ],
  options: [
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'cli.auto.rechaza_la_operacion_si_el_hash_de_la_nota_no_co',
    },
  ],
  async run(context): Promise<CommandResult> {
    const root = vaultRoot(context);
    const ref = readRef(context);
    const destination = readDestination(context);
    const ifMatch = readIfMatch(context.options.ifMatch);
    const index = await openVaultIndex(root);
    try {
      const warnings = await ensureIndexed(index);
      await assertIfMatch(root, ref, ifMatch);
      const moved = await moveNote(index, ref, destination);
      const result: CommandResult = {
        data: presentMove(moved),
        human: renderMove(moved),
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

export const rmCommand: CommandSpec = {
  name: 'rm',
  summary: 'cli.auto.borra_una_nota_con_force_convierte_los_enlaces_e',
  example: 'gaveta rm "orphan-note" --json',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: true }],
  options: [
    {
      name: 'force',
      flags: '--force',
      description: 'cli.auto.convierte_los_enlaces_entrantes_en_pendientes_en',
      kind: 'boolean',
    },
  ],
  async run(context): Promise<CommandResult> {
    const root = vaultRoot(context);
    const ref = readRef(context);
    const force = context.options.force === 'true';
    const index = await openVaultIndex(root);
    try {
      const warnings = await ensureIndexed(index);
      const removed = await removeNote(index, ref, { force });
      const result: CommandResult = {
        data: presentRemove(removed),
        human: renderRemove(removed),
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

function readDestination(context: CommandContext): string {
  const destination = context.positionals[1];
  if (destination === undefined || destination.includes('\0') || destination.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_DEST });
  }
  return destination.trim();
}

function readIfMatch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return parseNoteContentHash(value);
  } catch {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_HASH });
  }
}

async function assertIfMatch(
  root: string,
  ref: string,
  ifMatch: string | undefined,
): Promise<void> {
  if (ifMatch === undefined) {
    return;
  }
  const note = await readNote({ vaultRoot: root, ref, as: 'html' });
  requireNoteContentHash(note.hash, ifMatch);
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

function presentMove(moved: MoveNoteResult): Record<string, unknown> {
  return {
    id: moved.id,
    from: moved.from,
    to: moved.to,
    rewritten: [...moved.rewritten],
  };
}

function renderMove(moved: MoveNoteResult): string {
  const count = moved.rewritten.length;
  const rewritten =
    count === 0
      ? ''
      : count === 1
        ? hm('cli.human.move.rewritten_one')
        : hm('cli.human.move.rewritten_many', { count });
  const id = moved.id === null ? '' : `${moved.id}\n`;
  return hm('cli.human.move.done', { from: moved.from, to: moved.to, id, rewritten });
}

function presentRemove(removed: RemoveNoteResult): Record<string, unknown> {
  return {
    id: removed.id,
    path: removed.path,
    title: removed.title,
    forced: removed.forced,
    pending: [...removed.pending],
  };
}

function renderRemove(removed: RemoveNoteResult): string {
  const pending = removed.pending.length;
  const extra =
    pending === 0
      ? ''
      : pending === 1
        ? hm('cli.human.remove.pending_one')
        : hm('cli.human.remove.pending_many', { count: pending });
  const id = removed.id === null ? '' : `${removed.id}\n`;
  return hm('cli.human.remove.done', { path: removed.path, id, pending: extra });
}
