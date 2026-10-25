import { exportVaultToMarkdown, GavetaError } from '@gaveta/core';
import type { CommandResult, CommandSpec, CommandWarning } from '../types.ts';
import {
  buildExportCliData,
  renderMigrationSummary,
  type ExportCliData,
} from './migration-report.ts';
import { renderExportConflictLines } from './migration-human.ts';

function aggregateWarnings(data: ExportCliData): CommandWarning[] {
  const warnings: CommandWarning[] = [];
  for (const note of data.notes) {
    for (const warning of note.warnings) {
      warnings.push({
        code: warning.code,
        ...(warning.params !== undefined ? { params: warning.params } : {}),
      });
    }
  }
  return warnings;
}

function renderHuman(data: ExportCliData): string {
  const labels = {
    created: 'notas',
    overwritten: 'sobrescritas',
    renamed: 'renombradas',
    skipped: 'omitidas',
    failed: 'conflictos',
    attachments: 'adjuntos',
  };
  const summary = renderMigrationSummary(data.summary, labels);
  const lines: string[] = [];
  if (data.dryRun) {
    if (data.blocked) {
      lines.push(`Vista previa bloqueada: ${summary}.`);
      lines.push('Conflictos:');
      lines.push(...renderExportConflictLines(data.conflicts));
    } else {
      lines.push(`Vista previa de exportación a ${data.outDir}: ${summary}.`);
    }
  } else {
    lines.push(`Exportación completada en ${data.outDir}: ${summary}.`);
  }
  if (!data.dryRun && data.conflicts.length > 0) {
    lines.push('Conflictos:');
    lines.push(...renderExportConflictLines(data.conflicts));
  }
  return `${lines.join('\n')}\n`;
}

export const exportCommand: CommandSpec = {
  name: 'export',
  summary: 'cli.auto.exporta_notas_del_vault_a_markdown',
  example: 'gaveta export --all --to md --out ./export-md --links wiki --dry-run --json',
  requiresVault: true,
  input: 'none',
  args: [
    {
      name: 'ref',
      description: 'cli.auto.referencia_de_nota_o_carpeta_dentro_del_vault_om',
      required: false,
    },
  ],
  options: [
    {
      name: 'all',
      flags: '--all',
      description: 'cli.auto.exporta_todas_las_notas_del_vault',
      kind: 'boolean',
    },
    {
      name: 'to',
      flags: '--to <formato>',
      description: 'cli.auto.formato_de_salida_solo_md',
      choices: ['md'],
    },
    {
      name: 'out',
      flags: '--out <dir>',
      description: 'cli.auto.directorio_de_salida_debe_quedar_fuera_del_vault',
    },
    {
      name: 'links',
      flags: '--links <modo>',
      description: 'cli.auto.enlaces_canonicos_como_wikilinks_wiki_o_rutas_re',
      choices: ['wiki', 'relative'],
    },
    {
      name: 'dryRun',
      flags: '--dry-run',
      description: 'cli.auto.lista_los_archivos_que_se_escribirian_sin_modifi',
      kind: 'boolean',
    },
    {
      name: 'force',
      flags: '--force',
      description: 'cli.auto.sobrescribe_archivos_que_ya_existan_en_el_destin',
      kind: 'boolean',
    },
  ],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const format = context.options.to;
    if (format !== 'md') {
      throw new GavetaError('E_ARG_INVALID');
    }
    const outDir = context.options.out;
    if (outDir === undefined || outDir.length === 0) {
      throw new GavetaError('E_ARG_INVALID');
    }
    const all = context.options.all === 'true';
    const ref = context.positionals[0];
    const report = await exportVaultToMarkdown({
      vaultRoot: context.vault.root,
      cwd: context.cwd,
      outDir,
      format: 'md',
      ...(all ? { all: true } : {}),
      ...(ref !== undefined ? { ref } : {}),
      ...(context.options.links === 'wiki' || context.options.links === 'relative'
        ? { links: context.options.links }
        : {}),
      dryRun: context.options.dryRun === 'true',
      force: context.options.force === 'true',
    });
    const data = buildExportCliData(report);
    return {
      data,
      human: renderHuman(data),
      warnings: aggregateWarnings(data),
    };
  },
};
