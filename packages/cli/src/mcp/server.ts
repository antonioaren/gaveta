import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CommandSpec } from '../types.ts';
import { invokeMcpTool } from './invoke.ts';
import { buildMcpInputSchema } from './schema.ts';
import { listMcpToolDefinitions } from './tool-definitions.ts';
import { cliVersion } from '../commands/version.ts';

function logStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function createMcpServer(registry: readonly CommandSpec[]): McpServer {
  const server = new McpServer({
    name: 'gaveta',
    version: cliVersion(),
  });
  for (const tool of listMcpToolDefinitions(registry)) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: buildMcpInputSchema(tool.spec, tool.subcommand),
      },
      async (args) => {
        const result = await invokeMcpTool(tool, args, {
          cwd: process.cwd(),
          env: process.env,
        });
        if (result.stderr.length > 0) {
          logStderr(result.stderr.trimEnd());
        }
        const text = result.stdout.length > 0 ? result.stdout : result.stderr;
        return {
          content: [{ type: 'text', text }],
          isError: result.exitCode !== 0,
        };
      },
    );
  }
  return server;
}

export async function runMcpStdioServer(registry: readonly CommandSpec[]): Promise<void> {
  const server = createMcpServer(registry);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
