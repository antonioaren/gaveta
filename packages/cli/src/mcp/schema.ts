import { z } from 'zod/v4';
import type { CommandArgument, CommandOption, CommandSpec, CommandSubSpec } from '../types.ts';
import { m } from '../messages.ts';
import { mcpArgKey } from './arg-keys.ts';

export const MCP_CONTENT_PROPERTY = 'content';
export const MCP_FROM_PROPERTY = 'from';

export type McpZodShape = Record<string, z.ZodType>;

function longFlag(flags: string): string {
  const match = /--[a-z0-9-]+/i.exec(flags);
  if (match === null) {
    return flags;
  }
  return match[0];
}

function optionField(option: CommandOption): z.ZodType {
  const description = m(option.description);
  if (option.kind === 'boolean') {
    return z.boolean().optional().describe(description);
  }
  if (option.kind === 'stringList') {
    return z.array(z.string().min(1)).optional().describe(description);
  }
  if (option.choices !== undefined) {
    return z
      .enum(option.choices as [string, ...string[]])
      .optional()
      .describe(description);
  }
  return z.string().min(1).optional().describe(description);
}

function positionalField(arg: CommandArgument): z.ZodType {
  const field = z.string().min(1).describe(m(arg.description));
  return arg.required ? field : field.optional();
}

function commandInputMode(
  spec: CommandSpec,
  subcommand: CommandSubSpec | undefined,
): CommandSpec['input'] {
  if (subcommand !== undefined) {
    return subcommand.input ?? 'none';
  }
  return spec.input;
}

function commandArgs(
  spec: CommandSpec,
  subcommand: CommandSubSpec | undefined,
): readonly CommandArgument[] | undefined {
  if (subcommand !== undefined) {
    return subcommand.args;
  }
  return spec.args;
}

/** Build a Zod raw shape for an MCP tool from a CLI command spec. */
export function buildMcpInputSchema(
  spec: CommandSpec,
  subcommand: CommandSubSpec | undefined,
): McpZodShape {
  const shape: McpZodShape = {};

  shape.vault = z.string().min(1).optional().describe(m('cli.mcp.schemaVault'));
  shape.lang = z.enum(['en', 'es']).optional().describe(m('cli.mcp.schemaLang'));

  const inputMode = commandInputMode(spec, subcommand);
  if (inputMode !== 'none') {
    shape[MCP_FROM_PROPERTY] = z.string().min(1).optional().describe(m('cli.mcp.schemaFrom'));
    shape[MCP_CONTENT_PROPERTY] = z.string().optional().describe(m('cli.mcp.schemaContent'));
  }

  for (const arg of commandArgs(spec, subcommand) ?? []) {
    shape[mcpArgKey(arg.name)] = positionalField(arg);
  }

  if (subcommand === undefined && spec.contentArgument !== undefined) {
    shape[mcpArgKey(spec.contentArgument.name)] = positionalField({
      name: spec.contentArgument.name,
      description: spec.contentArgument.description,
      required: spec.contentArgument.required,
    });
  }

  const options = subcommand?.options ?? spec.options ?? [];
  for (const option of options) {
    shape[option.name] = optionField(option);
    void longFlag(option.flags);
  }

  return shape;
}

export function optionCliFlag(option: CommandOption): string {
  return longFlag(option.flags);
}
