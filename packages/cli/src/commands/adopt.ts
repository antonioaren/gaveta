import { GavetaError, adoptNote, isNoteType } from '@gaveta/core';
import type { CommandResult, CommandSpec } from '../types.ts';

export const adoptCommand: CommandSpec = {
  name: 'adopt',
  summary: 'cli.auto.convierte_un_html_del_vault_en_una_nota_la_valid',
  example: 'gaveta adopt nota.html',
  requiresVault: true,
  input: 'none',
  args: [
    {
      name: 'ruta',
      description: 'cli.auto.ruta_de_la_nota_html_dentro_del_vault',
      required: true,
    },
  ],
  options: [
    {
      name: 'source',
      flags: '--source <origen>',
      description: 'cli.auto.origen_del_html_claude_convierte_artefactos_de_c',
      choices: ['claude'],
    },
    {
      name: 'as',
      flags: '--as <tipo>',
      description: 'cli.auto.fuerza_el_tipo_doc_slides_dashboard_design_o_art',
      choices: ['doc', 'slides', 'dashboard', 'design', 'artifact', 'todo'],
    },
    {
      name: 'allowCdn',
      flags: '--allow-cdn',
      description: 'cli.auto.permite_scripts_y_estilos_cdn_dentro_del_srcdoc_',
      kind: 'boolean',
    },
  ],
  async run(context): Promise<CommandResult> {
    const ruta = context.positionals[0];
    if (context.vault === null || ruta === undefined) {
      throw new GavetaError('E_ARG_INVALID');
    }
    const asType = context.options.as;
    if (asType !== undefined && !isNoteType(asType)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    const result = await adoptNote(context.vault.root, ruta, {
      ...(context.strictRel ? { strictRel: true } : {}),
      ...(context.options.source === 'claude' ? { source: 'claude' } : {}),
      ...(asType !== undefined ? { as: asType } : {}),
      ...(context.options.allowCdn === 'true' ? { allowCdn: true } : {}),
    });
    if (!result.adopted) {
      return { data: null, human: '', warnings: result.warnings };
    }
    return {
      data: {
        id: result.id,
        path: result.path,
        hash: result.hash,
        type: result.type,
        title: result.title,
      },
      human: `Nota adoptada: ${result.path} (${result.id})\n`,
      warnings: result.warnings,
    };
  },
};
