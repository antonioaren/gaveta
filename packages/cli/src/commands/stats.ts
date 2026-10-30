import {
  GavetaError,
  COMMAND_LOG_RELATIVE,
  computeVaultStats,
  type VaultStats,
} from '@gaveta/core';
import { hm } from '../messages.ts';
import type { CommandResult, CommandSpec } from '../types.ts';

export const statsCommand: CommandSpec = {
  name: 'stats',
  summary: 'cli.auto.muestra_las_metricas_del_prd_desde_el_indice_y_el',
  example: 'gaveta stats --json',
  requiresVault: true,
  input: 'none',
  options: [],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const stats = await computeVaultStats(context.vault.root);
    return {
      data: presentStats(stats),
      human: renderHuman(stats),
    };
  },
};

function presentStats(stats: VaultStats) {
  return {
    index: {
      ...stats.index,
      connectedNoteRate: stats.index.connectedNoteRate,
      orphanNoteRate: stats.index.orphanNoteRate,
    },
    log: stats.log,
  };
}

function formatPercent(rate: number | null): string {
  if (rate === null) {
    return '—';
  }
  const percent = rate * 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatAverage(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function renderHuman(stats: VaultStats): string {
  const lines = [
    hm('cli.human.stats.index', {
      notes: stats.index.notes,
      connectedRate: formatPercent(stats.index.connectedNoteRate),
      orphans: stats.index.orphanNotes,
      broken: stats.index.brokenLinks,
      pending: stats.index.pendingLinks,
      avgOutgoing: formatAverage(stats.index.averageOutgoingLinksPerNote),
    }),
  ];
  if (!stats.log.present) {
    lines.push(hm('cli.human.stats.log_missing', { path: COMMAND_LOG_RELATIVE }));
    lines.push(hm('cli.human.stats.log_opt_in'));
  } else {
    lines.push(
      hm('cli.human.stats.log', {
        commands: stats.log.commandEntries,
        successRate: formatPercent(stats.log.commandSuccessRate),
        validationPerNote: formatAverage(stats.log.validationErrorsPerNoteCreated),
        avgLinksCreated: formatAverage(stats.log.averageOutgoingLinksPerNoteCreated),
        p95Ms: stats.log.cliDurationP95Ms ?? '—',
        activeDays: stats.log.activeDaysLast7,
      }),
    );
  }
  return `${lines.join('\n')}\n`;
}
