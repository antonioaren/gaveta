import { GavetaError, adoptNote } from '@gaveta/core';
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
  async run(context): Promise<CommandResult> {
    const ruta = context.positionals[0];
    if (context.vault === null || ruta === undefined) {
      throw new GavetaError('E_ARG_INVALID');
    }
    const result = await adoptNote(
      context.vault.root,
      ruta,
      context.strictRel ? { strictRel: true } : {},
    );
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
