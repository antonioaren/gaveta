import { GavetaError, openVaultIndex, type ReindexReport } from '@gaveta/core';
import type { CommandResult, CommandSpec, CommandWarning } from '../types.ts';

interface ReindexView {
  readonly mode: 'incremental' | 'full';
  readonly written: number;
  readonly removed: number;
  readonly problemCount: number;
  readonly duplicateCount: number;
}

export const reindexCommand: CommandSpec = {
  name: 'reindex',
  summary: 'Actualiza el índice SQLite desde los archivos del vault.',
  example: 'gaveta reindex --json',
  requiresVault: true,
  input: 'none',
  options: [
    {
      name: 'full',
      flags: '--full',
      description: 'Reconstruye el índice desde cero.',
      kind: 'boolean',
    },
  ],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const full = context.options.full === 'true';
    const index = await openVaultIndex(context.vault.root);
    try {
      const recovered = index.recovery();
      const report = full || recovered !== null ? await index.rebuild() : await index.sync();
      const warnings = recovered === null ? undefined : [{ code: 'W_INDEX_RECOVERED' as const }];
      return present(full ? 'full' : 'incremental', report, warnings);
    } finally {
      index.close();
    }
  },
};

function present(
  mode: 'incremental' | 'full',
  report: ReindexReport,
  warnings?: readonly CommandWarning[],
): CommandResult {
  const view: ReindexView = {
    mode,
    written: report.written,
    removed: report.removed,
    problemCount: report.problems.length,
    duplicateCount: report.duplicates.length,
  };
  const human =
    mode === 'full'
      ? `Reindexado completo: ${String(report.written)} nota(s) escrita(s), ${String(report.removed)} eliminada(s).\n`
      : `Reindexado incremental: ${String(report.written)} nota(s) actualizada(s), ${String(report.removed)} eliminada(s).\n`;
  const result: CommandResult = { data: view, human };
  if (warnings === undefined) {
    return result;
  }
  return { ...result, warnings };
}
