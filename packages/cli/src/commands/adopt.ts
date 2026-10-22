import { GavetaError, adoptNote, isNoteType } from '@gaveta/core';
import type { CommandResult, CommandSpec } from '../types.ts';

export const adoptCommand: CommandSpec = {
  name: 'adopt',
  summary: 'Convierte un HTML del vault en una nota, la valida y la indexa.',
  example: 'gaveta adopt nota.html',
  requiresVault: true,
  input: 'none',
  args: [
    {
      name: 'ruta',
      description: 'Ruta de la nota HTML dentro del vault.',
      required: true,
    },
  ],
  options: [
    {
      name: 'source',
      flags: '--source <origen>',
      description: 'Origen del HTML: claude convierte artefactos de Claude.',
      choices: ['claude'],
    },
    {
      name: 'as',
      flags: '--as <tipo>',
      description: 'Fuerza el tipo: doc, slides, dashboard, design o artifact.',
      choices: ['doc', 'slides', 'dashboard', 'design', 'artifact', 'todo'],
    },
    {
      name: 'allowCdn',
      flags: '--allow-cdn',
      description: 'Permite scripts y estilos CDN dentro del srcdoc de artifact.',
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
