import { initVault, resolveInitDirectory } from '@gaveta/core';
import type { CommandResult, CommandSpec } from '../types.ts';

export const initCommand: CommandSpec = {
  name: 'init',
  summary: 'cli.auto.crea_un_vault_o_lo_completa_sin_tocar_los_archiv',
  example: 'gaveta init --agent-instructions agents',
  requiresVault: false,
  skipsVaultDiscovery: true,
  input: 'none',
  args: [
    {
      name: 'dir',
      description: 'cli.auto.directorio_del_vault_por_defecto_el_directorio_a',
      required: false,
    },
  ],
  options: [
    {
      name: 'agentInstructions',
      flags: '--agent-instructions <destino>',
      description: 'cli.auto.escribe_un_bloque_idempotente_en_claude_md_agent',
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
