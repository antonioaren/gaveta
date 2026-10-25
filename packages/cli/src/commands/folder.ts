import {
  ABSENT_NOTE_HASH,
  GavetaError,
  createFolder,
  moveFolder,
  openVaultIndex,
  parseNoteContentHash,
  removeFolder,
  requireNoteContentHash,
  type MoveFolderResult,
  type RemoveFolderResult,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import type { CommandContext, CommandResult, CommandSpec } from '../types.ts';

const MISSING_FOLDER = 'cli.auto.falta_la_carpeta';
const MISSING_DEST = 'cli.auto.falta_el_destino';
const BAD_HASH = 'cli.auto.el_hash_de_if_match_tiene_que_ser_sha256_y_64_he';

export const mkdirCommand: CommandSpec = {
  name: 'mkdir',
  summary: 'cli.auto.crea_una_carpeta_vacia_dentro_del_vault',
  example: `gaveta mkdir decisiones --if-match ${ABSENT_NOTE_HASH} --json`,
  requiresVault: true,
  input: 'none',
  args: [
    {
      name: 'carpeta',
      description: 'cli.auto.ruta_de_la_carpeta_dentro_del_vault',
      required: true,
    },
  ],
  options: [
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'cli.auto.debe_ser_el_hash_ausente_para_crear_carpetas',
    },
  ],
  async run(context): Promise<CommandResult> {
    const root = vaultRoot(context);
    const folder = readFolder(context);
    const ifMatch = readIfMatch(context.options.ifMatch);
    requireNoteContentHash(ABSENT_NOTE_HASH, ifMatch);
    const created = await createFolder({ vaultRoot: root, folder });
    return {
      data: { folder: created.folder },
      human: `Carpeta creada: ${created.folder}\n`,
    };
  },
};

export const mvFolderCommand: CommandSpec = {
  name: 'mv-folder',
  summary: 'cli.auto.renombra_o_mueve_una_carpeta_y_reescribe_los_enl',
  example: 'gaveta mv-folder enlaces archivo/enlaces --json',
  requiresVault: true,
  input: 'none',
  args: [
    { name: 'origen', description: 'cli.auto.carpeta_de_origen', required: true },
    { name: 'destino', description: 'cli.auto.carpeta_de_destino', required: true },
  ],
  options: [
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'cli.auto.debe_ser_el_hash_ausente_para_mover_carpetas',
    },
  ],
  async run(context): Promise<CommandResult> {
    const root = vaultRoot(context);
    const from = readFolderArg(context, 0);
    const to = readFolderArg(context, 1);
    const ifMatch = readIfMatch(context.options.ifMatch);
    requireNoteContentHash(ABSENT_NOTE_HASH, ifMatch);
    const index = await openVaultIndex(root);
    try {
      const moved = await moveFolder(index, from, to);
      return { data: presentMoveFolder(moved), human: renderMoveFolder(moved) };
    } finally {
      index.close();
    }
  },
};

export const rmFolderCommand: CommandSpec = {
  name: 'rm-folder',
  summary: 'cli.auto.borra_una_carpeta_y_todas_sus_notas_con_force_co',
  example: 'gaveta rm-folder temporal --force --json',
  requiresVault: true,
  input: 'none',
  args: [{ name: 'carpeta', description: 'cli.auto.carpeta_a_borrar', required: true }],
  options: [
    {
      name: 'force',
      flags: '--force',
      description: 'cli.auto.convierte_los_enlaces_entrantes_en_pendientes',
      kind: 'boolean',
    },
    {
      name: 'ifMatch',
      flags: '--if-match <hash>',
      description: 'cli.auto.debe_ser_el_hash_ausente_para_borrar_carpetas',
    },
  ],
  async run(context): Promise<CommandResult> {
    const root = vaultRoot(context);
    const folder = readFolder(context);
    const force = context.options.force === 'true';
    const ifMatch = readIfMatch(context.options.ifMatch);
    requireNoteContentHash(ABSENT_NOTE_HASH, ifMatch);
    const index = await openVaultIndex(root);
    try {
      const removed = await removeFolder(index, folder, { force });
      return { data: presentRemoveFolder(removed), human: renderRemoveFolder(removed) };
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

function readFolder(context: CommandContext): string {
  const folder = context.positionals[0];
  if (folder === undefined || folder.includes('\0') || folder.trim().length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_FOLDER });
  }
  return folder.trim();
}

function readFolderArg(context: CommandContext, index: number): string {
  const folder = context.positionals[index];
  if (folder === undefined || folder.includes('\0') || folder.trim().length === 0) {
    throw new CliFailure(
      'E_ARG_INVALID',
      {},
      { problem: index === 0 ? MISSING_FOLDER : MISSING_DEST },
    );
  }
  return folder.trim();
}

function readIfMatch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return parseNoteContentHash(value.trim());
  } catch {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_HASH });
  }
}

function presentMoveFolder(moved: MoveFolderResult): Record<string, unknown> {
  return {
    from: moved.from,
    to: moved.to,
    moved: moved.moved.map((row) => ({ from: row.from, to: row.to, id: row.id })),
    rewritten: [...moved.rewritten],
  };
}

function renderMoveFolder(moved: MoveFolderResult): string {
  return `Carpeta ${moved.from} → ${moved.to} (${String(moved.moved.length)} notas)\n`;
}

function presentRemoveFolder(removed: RemoveFolderResult): Record<string, unknown> {
  return {
    folder: removed.folder,
    removed: [...removed.removed],
    forced: removed.forced,
    pending: [...removed.pending],
  };
}

function renderRemoveFolder(removed: RemoveFolderResult): string {
  return `Carpeta ${removed.folder} eliminada (${String(removed.removed.length)} notas)\n`;
}
