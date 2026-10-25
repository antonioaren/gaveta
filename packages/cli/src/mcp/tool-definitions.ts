import type { CommandSpec, CommandSubSpec } from '../types.ts';
import { m } from '../messages.ts';
import { MCP_EXCLUDED_COMMANDS } from './excluded.ts';

export interface McpToolDefinition {
  readonly name: string;
  readonly spec: CommandSpec;
  readonly subcommand: CommandSubSpec | undefined;
  readonly description: string;
}

export function mcpToolName(spec: CommandSpec, subcommand: CommandSubSpec | undefined): string {
  if (subcommand === undefined) {
    return spec.name;
  }
  return `${spec.name}_${subcommand.name}`;
}

export function listMcpToolDefinitions(registry: readonly CommandSpec[]): McpToolDefinition[] {
  const tools: McpToolDefinition[] = [];
  for (const spec of registry) {
    if (MCP_EXCLUDED_COMMANDS.has(spec.name)) {
      continue;
    }
    if (spec.subcommands !== undefined && spec.subcommands.length > 0) {
      for (const sub of spec.subcommands) {
        tools.push({
          name: mcpToolName(spec, sub),
          spec,
          subcommand: sub,
          description: m(sub.summary),
        });
      }
      continue;
    }
    tools.push({
      name: mcpToolName(spec, undefined),
      spec,
      subcommand: undefined,
      description: m(spec.summary),
    });
  }
  return tools;
}

export function findMcpToolDefinition(
  registry: readonly CommandSpec[],
  toolName: string,
): McpToolDefinition | undefined {
  return listMcpToolDefinitions(registry).find((tool) => tool.name === toolName);
}
