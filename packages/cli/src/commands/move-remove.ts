import {
  GavetaError,
  moveNote,
  openVaultIndex,
  readNote,
  removeNote,
  type MoveNoteResult,
  type RemoveNoteResult,
  type VaultIndex,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';

const MISSING_REF = 'Falta la referencia.';
const MISSING_DEST = 'Falta el destino.';
const BAD_HASH = 'El hash de --if-match tiene que ser sha256: y 64 hexadecimales.';
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

export const mvCommand: CommandSpec = {
  name: 'mv',
  summary: 'Mueve o renombra una nota y reescribe los enlaces entrantes.',
  example: 'gaveta mv "Nota X" otra/carpeta/ --json',
  requiresVault: true,
  input: 'none',
  args: [
    { name: 'ref', description: 'Id, ruta o título de la nota.', required: true },
    { name: 'destino', description: 'Ruta o carpeta de destino dentro del vault.', required: true },
  ],
  options: [
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'Rechaza la operación si el hash de la nota no coincide.',
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
  summary: 'Borra una nota. Con --force convierte los enlaces entrantes en pendientes.',
  example: 'gaveta rm "Nota huérfana" --json',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'ref', description: 'Id, ruta o título de la nota.', required: true }],
  options: [
    {
      name: 'force',
      flags: '--force',
      description: 'Convierte los enlaces entrantes en pendientes en lugar de fallar.',
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
  if (!CONTENT_HASH.test(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_HASH });
  }
  return value;
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
  if (note.hash !== ifMatch) {
    throw new GavetaError('E_CONFLICT');
  }
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
    count === 0 ? '' : count === 1 ? '1 nota reescrita\n' : `${String(count)} notas reescritas\n`;
  const id = moved.id === null ? '' : `${moved.id}\n`;
  return `Movida ${moved.from} → ${moved.to}\n${id}${rewritten}`;
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
        ? '1 enlace convertido en pendiente\n'
        : `${String(pending)} enlaces convertidos en pendientes\n`;
  const id = removed.id === null ? '' : `${removed.id}\n`;
  return `Borrada ${removed.path}\n${id}${extra}`;
}
