import type { CommandResult, CommandSpec } from '../types.ts';
import { runMcpStdioServer } from '../mcp/server.ts';

export const mcpCommand: CommandSpec = {
  name: 'mcp',
  summary: 'cli.auto.expone_los_comandos_de_gaveta_como_servidor_mcp_p',
  example: 'gaveta mcp',
  requiresVault: false,
  skipsVaultDiscovery: true,
  input: 'none',
  async run(): Promise<CommandResult> {
    const { commands } = await import('../registry.ts');
    await runMcpStdioServer(commands);
    return {
      data: null,
      human: '',
    };
  },
};
