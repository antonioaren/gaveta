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
  summary: 'Exporta notas del vault a Markdown.',
  example: 'gaveta export --all --to md --out ./export-md --links wiki --dry-run --json',
  requiresVault: true,
  input: 'none',
  args: [
    {
      name: 'ref',
      description: 'Referencia de nota o carpeta dentro del vault (omitir con --all).',
      required: false,
    },
  ],
  options: [
    {
      name: 'all',
      flags: '--all',
      description: 'Exporta todas las notas del vault.',
      kind: 'boolean',
    },
    {
      name: 'to',
      flags: '--to <formato>',
      description: 'Formato de salida (solo md).',
      choices: ['md'],
    },
    {
      name: 'out',
      flags: '--out <dir>',
      description: 'Directorio de salida (debe quedar fuera del vault).',
    },
    {
      name: 'links',
      flags: '--links <modo>',
      description: 'Enlaces canónicos como wikilinks (wiki) o rutas relativas .md (relative).',
      choices: ['wiki', 'relative'],
    },
    {
      name: 'dryRun',
      flags: '--dry-run',
      description: 'Lista los archivos que se escribirían sin modificar el disco.',
      kind: 'boolean',
    },
    {
      name: 'force',
      flags: '--force',
      description: 'Sobrescribe archivos que ya existan en el destino.',
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
