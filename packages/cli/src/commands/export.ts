import { exportVaultToMarkdown, GavetaError, type ExportVaultReport } from '@gaveta/core';
import type { CommandResult, CommandSpec, CommandWarning } from '../types.ts';

function aggregateWarnings(report: ExportVaultReport): CommandWarning[] {
  const warnings: CommandWarning[] = [];
  for (const note of report.notes) {
    for (const warning of note.warnings) {
      warnings.push({
        code: warning.code,
        ...(warning.params !== undefined ? { params: warning.params } : {}),
      });
    }
  }
  return warnings;
}

function renderHuman(report: ExportVaultReport): string {
  if (report.dryRun) {
    if (report.blocked) {
      const lines = ['La exportación se bloquearía por conflictos:'];
      for (const conflict of report.conflicts) {
        lines.push(`- ${conflict.path} (${conflict.detail})`);
      }
      return `${lines.join('\n')}\n`;
    }
    if (report.notes.length === 0) {
      return 'No se escribiría ningún archivo.\n';
    }
    const lines = ['Se escribirían:'];
    for (const note of report.notes) {
      lines.push(`- ${note.path}`);
    }
    for (const attachment of report.attachments) {
      lines.push(`- ${attachment}`);
    }
    return `${lines.join('\n')}\n`;
  }
  const count = report.notes.length;
  return `Exportadas ${String(count)} nota(s) a ${report.outDir}.\n`;
}

export const exportCommand: CommandSpec = {
  name: 'export',
  summary: 'Exporta notas del vault a Markdown.',
  example: 'gaveta export --all --to md --out ./gaveta-export --dry-run --json',
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
    return {
      data: report,
      human: renderHuman(report),
      warnings: aggregateWarnings(report),
    };
  },
};
