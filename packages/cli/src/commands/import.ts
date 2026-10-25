import { EXIT_CODES, GavetaError, importMarkdownFolder, type ImportOnConflict } from '@gaveta/core';
import path from 'node:path';
import type { CommandResult, CommandSpec, CommandWarning } from '../types.ts';
import { STRING_LIST_SEPARATOR } from '../types.ts';
import {
  buildImportCliData,
  renderMigrationSummary,
  type ImportCliData,
} from './migration-report.ts';
import { renderImportFailureLines } from './migration-human.ts';

function readExclude(value: string | undefined): readonly string[] {
  if (value === undefined || value.length === 0) {
    return [];
  }
  return value.split(STRING_LIST_SEPARATOR);
}

function readOnConflict(value: string | undefined): ImportOnConflict {
  if (value === undefined || value === 'skip') {
    return 'skip';
  }
  if (value === 'rename' || value === 'overwrite') {
    return value;
  }
  throw new GavetaError('E_ARG_INVALID');
}

function aggregateWarnings(data: ImportCliData): CommandWarning[] {
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

function renderHuman(data: ImportCliData): string {
  const labels = {
    created: 'creadas',
    overwritten: 'sobrescritas',
    renamed: 'renombradas',
    skipped: 'omitidas',
    failed: 'fallidas',
    attachments: 'adjuntos',
  };
  const summary = renderMigrationSummary(data.summary, labels);
  const lines: string[] = [];
  if (data.dryRun) {
    lines.push(`Vista previa de importación: ${summary}.`);
  } else if (!data.ok) {
    lines.push(`Importación incompleta: ${summary}.`);
  } else {
    lines.push(`Importación completada: ${summary}.`);
  }
  if (data.failures.length > 0) {
    lines.push('Fallos:');
    lines.push(...renderImportFailureLines(data.failures));
  }
  return `${lines.join('\n')}\n`;
}

export const importCommand: CommandSpec = {
  name: 'import',
  summary: 'cli.auto.importa_markdown_desde_un_archivo_o_una_carpeta_',
  example:
    'gaveta import ./docs --in proyectos --dry-run --on-conflict skip --continue-on-error --json',
  requiresVault: true,
  input: 'none',
  args: [
    {
      name: 'ruta',
      description: 'cli.auto.archivo_md_o_carpeta_con_markdown_fuera_del_vaul',
      required: true,
    },
  ],
  options: [
    {
      name: 'in',
      flags: '--in <carpeta>',
      description: 'cli.auto.carpeta_destino_dentro_del_vault_raiz_si_se_omit',
    },
    {
      name: 'exclude',
      flags: '--exclude <patrón>',
      description: 'cli.auto.patron_glob_adicional_de_exclusion_repetible',
      kind: 'stringList',
    },
    {
      name: 'dryRun',
      flags: '--dry-run',
      description: 'cli.auto.planifica_la_importacion_sin_escribir_en_el_vaul',
      kind: 'boolean',
    },
    {
      name: 'onConflict',
      flags: '--on-conflict <modo>',
      description: 'cli.auto.que_hacer_si_la_nota_destino_ya_existe_skip_rena',
      choices: ['skip', 'rename', 'overwrite'],
    },
    {
      name: 'continueOnError',
      flags: '--continue-on-error',
      description: 'cli.auto.importa_las_notas_validas_y_lista_las_que_fallen',
      kind: 'boolean',
    },
  ],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const ruta = context.positionals[0];
    if (ruta === undefined || ruta.length === 0) {
      throw new GavetaError('E_ARG_INVALID');
    }
    const sourcePath = path.resolve(context.cwd, ruta);
    const exclude = readExclude(context.options.exclude);
    const inFolder = context.options.in;
    const result = await importMarkdownFolder({
      vaultRoot: context.vault.root,
      sourcePath,
      ...(inFolder !== undefined ? { in: inFolder } : {}),
      ...(exclude.length > 0 ? { exclude } : {}),
      dryRun: context.options.dryRun === 'true',
      onConflict: readOnConflict(context.options.onConflict),
      continueOnError: context.options.continueOnError === 'true',
    });
    const data = buildImportCliData(result);
    const exitCode = data.ok ? EXIT_CODES.ok : EXIT_CODES.validation;
    return {
      data,
      human: renderHuman(data),
      warnings: aggregateWarnings(data),
      exitCode,
    };
  },
};
