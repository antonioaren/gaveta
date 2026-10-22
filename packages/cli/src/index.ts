import { CORE_PACKAGE_ID } from '@gaveta/core';

/** Package id. */
export const CLI_PACKAGE_ID = '@gaveta/cli';

/** Core package linked by the CLI. Both interfaces share it. */
export const LINKED_CORE_PACKAGE_ID = CORE_PACKAGE_ID;

export { INTERNAL_ERROR_CODE, SCHEMA_VERSION } from './envelope.ts';
export type { FailureEnvelope, JsonErrorBody, JsonWarning, SuccessEnvelope } from './envelope.ts';

export { commands } from './registry.ts';
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
