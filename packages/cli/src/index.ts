import { CORE_PACKAGE_ID } from '@gaveta/core';

/** Package id. */
export const CLI_PACKAGE_ID = '@gaveta/cli';

/** Core package linked by the CLI. Both interfaces share it. */
export const LINKED_CORE_PACKAGE_ID = CORE_PACKAGE_ID;

export { INTERNAL_ERROR_CODE, SCHEMA_VERSION } from './envelope.ts';
export type { FailureEnvelope, JsonErrorBody, JsonWarning, SuccessEnvelope } from './envelope.ts';

export { commands } from './registry.ts';
export { GLOBAL_CLI_FLAGS, buildCliSurface, type CliSurface } from './cli-surface.ts';
export { tokensFromGavetaExample, tokenizeShellLine } from './example-tokens.ts';
export type {
  CommandArgument,
  CommandContext,
  CommandOption,
  CommandResult,
  CommandSpec,
  ResolvedInput,
} from './types.ts';

export { runCli } from './run.ts';
export type { CliIo } from './run.ts';

export { listMcpToolDefinitions, mcpToolName } from './mcp/tool-definitions.ts';
export type { McpToolDefinition } from './mcp/tool-definitions.ts';
export { buildMcpInputSchema } from './mcp/schema.ts';
export { invokeMcpTool, buildCliArgvFromMcpArgs } from './mcp/invoke.ts';
export { createMcpServer, runMcpStdioServer } from './mcp/server.ts';
