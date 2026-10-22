import { initVault, resolveInitDirectory } from '@gaveta/core';
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
      description:
        'Escribe un bloque idempotente en CLAUDE.md, AGENTS.md, .cursor/rules/gaveta.mdc o .github/copilot-instructions.md.',
      choices: ['claude', 'agents', 'cursor', 'copilot', 'all'],
    },
  ],
  async run(context): Promise<CommandResult> {
    const directory = resolveInitDirectory({
      ...(context.positionals[0] !== undefined ? { positional: context.positionals[0] } : {}),
      ...(context.vaultOption !== undefined ? { vaultOption: context.vaultOption } : {}),
      env: context.env,
    });
    const target = context.options.agentInstructions;
    const result = await initVault({
      cwd: context.cwd,
      ...(directory !== undefined ? { directory } : {}),
      ...(typeof target === 'string' ? { agentInstructions: target } : {}),
    });
    const lines = [
      result.created.length > 0
        ? `Vault creado en ${result.root}.`
        : `El vault ya existe en ${result.root}.`,
    ];
    for (const entry of result.agentInstructions) {
      lines.push(
        entry.changed
          ? `Instrucciones actualizadas en ${entry.path}.`
          : `Las instrucciones de ${entry.path} ya estaban al día.`,
      );
    }
    return { data: result, human: `${lines.join('\n')}\n` };
  },
};
