import { initVault } from '@gaveta/core';
import type { CommandResult, CommandSpec } from '../types.ts';

export const initCommand: CommandSpec = {
  name: 'init',
  summary: 'Crea un vault, o lo completa, sin tocar los archivos que ya existen.',
  example: 'gaveta init --agent-instructions agents',
  requiresVault: false,
  skipsVaultDiscovery: true,
  input: 'none',
  args: [
    {
      name: 'dir',
      description: 'Directorio del vault. Por defecto, el directorio actual.',
      required: false,
    },
  ],
  options: [
    {
      name: 'agentInstructions',
      flags: '--agent-instructions <destino>',
      description: 'Escribe un bloque idempotente en CLAUDE.md (claude) o AGENTS.md (agents).',
      choices: ['claude', 'agents'],
    },
  ],
  async run(context): Promise<CommandResult> {
    const directory = context.positionals[0];
    const target = context.options.agentInstructions;
    const result = await initVault({
      cwd: context.cwd,
      ...(typeof directory === 'string' ? { directory } : {}),
      ...(typeof target === 'string' ? { agentInstructions: target } : {}),
    });
    const lines = [
      result.created.length > 0
        ? `Vault creado en ${result.root}.`
        : `El vault ya existe en ${result.root}.`,
    ];
    if (result.agentInstructions !== null) {
      lines.push(
        result.agentInstructions.changed
          ? `Instrucciones actualizadas en ${result.agentInstructions.path}.`
          : `Las instrucciones de ${result.agentInstructions.path} ya estaban al día.`,
      );
    }
    return { data: result, human: `${lines.join('\n')}\n` };
  },
};
