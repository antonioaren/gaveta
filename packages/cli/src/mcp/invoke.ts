import { Readable } from 'node:stream';
import { CliFailure } from '../failure.ts';
import { runCli, type CliIo } from '../run.ts';
import type { CommandSpec, CommandSubSpec } from '../types.ts';
import type { McpToolDefinition } from './tool-definitions.ts';
import { MCP_CONTENT_PROPERTY, MCP_FROM_PROPERTY, optionCliFlag } from './schema.ts';

const MCP_GLOBAL_PROPERTIES = ['vault', 'lang'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: `Invalid MCP field: ${field}` });
  }
  return value;
}

function commandArgs(
  spec: CommandSpec,
  subcommand: CommandSubSpec | undefined,
): readonly { readonly name: string; readonly required: boolean }[] {
  const args = subcommand?.args ?? spec.args ?? [];
  const withContent =
    subcommand === undefined && spec.contentArgument !== undefined
      ? [
          ...args,
          {
            name: spec.contentArgument.name,
            required: spec.contentArgument.required,
          },
        ]
      : args;
  return withContent;
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

export function buildCliArgvFromMcpArgs(
  tool: McpToolDefinition,
  args: Record<string, unknown>,
): { readonly argv: readonly string[]; readonly stdinText?: string } {
  const { spec, subcommand } = tool;
  const argv: string[] = [spec.name];
  if (subcommand !== undefined) {
    argv.push(subcommand.name);
  }

  const fromPath = readString(args[MCP_FROM_PROPERTY], MCP_FROM_PROPERTY);
  const content = readString(args[MCP_CONTENT_PROPERTY], MCP_CONTENT_PROPERTY);
  if (fromPath !== undefined && content !== undefined) {
    throw new CliFailure(
      'E_ARG_INVALID',
      {},
      { problem: 'cli.auto.el_contenido_se_indica_por_argumento_o_por_from_' },
    );
  }

  for (const arg of commandArgs(spec, subcommand)) {
    const value = readString(args[arg.name], arg.name);
    if (value === undefined) {
      if (arg.required) {
        throw new CliFailure('E_ARG_INVALID', {}, { problem: 'cli.usage.missingArgument' });
      }
      continue;
    }
    argv.push(value);
  }

  const inputMode = commandInputMode(spec, subcommand);
  if (inputMode === 'required' && content === undefined && fromPath === undefined) {
    const hasContentArg =
      subcommand === undefined &&
      spec.contentArgument !== undefined &&
      readString(args[spec.contentArgument.name], spec.contentArgument.name) !== undefined;
    if (!hasContentArg) {
      throw new CliFailure(
        'E_ARG_INVALID',
        {},
        { problem: 'cli.auto.falta_el_contenido_pasalo_como_argumento_con_fro' },
      );
    }
  }

  const options = subcommand?.options ?? spec.options ?? [];
  for (const option of options) {
    const raw = args[option.name];
    if (raw === undefined) {
      continue;
    }
    const flag = optionCliFlag(option);
    if (option.kind === 'boolean') {
      if (raw === true) {
        argv.push(flag);
      } else if (raw !== false) {
        throw new CliFailure(
          'E_ARG_INVALID',
          {},
          { problem: 'cli.auto.el_argumento_no_es_valido' },
        );
      }
      continue;
    }
    if (option.kind === 'stringList') {
      if (!Array.isArray(raw)) {
        throw new CliFailure(
          'E_ARG_INVALID',
          {},
          { problem: 'cli.auto.el_argumento_no_es_valido' },
        );
      }
      const values: string[] = [];
      for (const item of raw) {
        if (typeof item !== 'string' || item.length === 0) {
          throw new CliFailure(
            'E_ARG_INVALID',
            {},
            { problem: 'cli.auto.el_argumento_no_es_valido' },
          );
        }
        values.push(item);
      }
      for (const item of values) {
        argv.push(flag, item);
      }
      continue;
    }
    const value = readString(raw, option.name);
    if (value !== undefined) {
      argv.push(flag, value);
    }
  }

  for (const key of MCP_GLOBAL_PROPERTIES) {
    const value = readString(args[key], key);
    if (value !== undefined) {
      argv.push(`--${key}`, value);
    }
  }

  let stdinText: string | undefined;
  if (content !== undefined) {
    argv.push('--from', '-');
    stdinText = content;
  } else if (fromPath !== undefined) {
    argv.push('--from', fromPath);
  }

  argv.push('--json');
  return stdinText === undefined ? { argv } : { argv, stdinText };
}

export interface McpInvokeResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function invokeMcpTool(
  tool: McpToolDefinition,
  args: unknown,
  io: CliIo = {},
): Promise<McpInvokeResult> {
  if (!isRecord(args)) {
    throw new CliFailure(
      'E_ARG_INVALID',
      {},
      { problem: 'cli.auto.los_argumentos_no_son_validos' },
    );
  }
  const { argv, stdinText } = buildCliArgvFromMcpArgs(tool, args);
  let stdout = '';
  let stderr = '';
  const exitCode = await runCli(['node', 'gaveta', ...argv], {
    ...io,
    ...(stdinText !== undefined
      ? { stdin: Readable.from([stdinText], { objectMode: false }) }
      : {}),
    stdout: (chunk) => {
      stdout += chunk;
    },
    stderr: (chunk) => {
      stderr += chunk;
    },
  });
  return { exitCode, stdout, stderr };
}
