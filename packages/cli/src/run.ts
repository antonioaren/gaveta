import {
  EXIT_CODES,
  GAVETA_VAULT_ENV,
  GavetaError,
  discoverVault,
  exitCodeFor,
  formatDiagnostic,
  readVaultConfig,
  type VaultLocation,
} from '@gaveta/core';
import { Command, CommanderError } from 'commander';
import type { Readable } from 'node:stream';
import { firstPositional, normalizeArgv } from './argv.ts';
import {
  INTERNAL_ERROR_CODE,
  INTERNAL_ERROR_HINT,
  INTERNAL_ERROR_MESSAGE,
  renderFailure,
  renderHumanError,
  renderHumanWarnings,
  renderSuccess,
  type JsonErrorBody,
  type JsonWarning,
} from './envelope.ts';
import { CliFailure } from './failure.ts';
import { renderHelp } from './help.ts';
import { readCommandInput } from './input.ts';
import { commands } from './registry.ts';
import type { CommandResult, CommandSpec, CommandWarning } from './types.ts';

export interface CliIo {
  readonly stdout?: (chunk: string) => void;
  readonly stderr?: (chunk: string) => void;
  readonly stdin?: Readable;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly registry?: readonly CommandSpec[];
}

interface Globals {
  readonly json: boolean;
  readonly vault: string | undefined;
  readonly from: string | undefined;
}

interface ParsedCommand {
  readonly spec: CommandSpec;
  readonly positionals: readonly string[];
  readonly options: Readonly<Record<string, string>>;
}

interface Writers {
  readonly stdout: (chunk: string) => void;
  readonly stderr: (chunk: string) => void;
}

export async function runCli(argv: readonly string[], io: CliIo = {}): Promise<number> {
  const writers: Writers = {
    stdout: io.stdout ?? writeStdout,
    stderr: io.stderr ?? writeStderr,
  };
  const registry = io.registry ?? commands;
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;
  const stdin = io.stdin ?? process.stdin;
  const userArgs = normalizeArgv(argv.slice(2));
  const jsonRequested = userArgs.includes('--json');
  const commandName = firstPositional(userArgs);

  let json = jsonRequested;
  try {
    const parsed = await parseCommand(registry, userArgs);
    if (parsed.kind === 'help') {
      writers.stdout(renderHelp(registry, parsed.commandName));
      return EXIT_CODES.ok;
    }
    if (parsed.kind === 'usage') {
      return writeFailure(writers, jsonRequested, parsed.commandName, parsed.failure, {
        help: renderHelp(registry, knownCommand(registry, parsed.commandName)),
      });
    }
    json = parsed.globals.json;
    return await execute(parsed.command, parsed.globals, {
      writers,
      registry,
      cwd,
      env,
      stdin,
      json,
    });
  } catch (error) {
    return reportCaught(writers, json, commandName, error, false);
  }
}

type ParseResult =
  | { readonly kind: 'help'; readonly commandName: string | undefined }
  | {
      readonly kind: 'usage';
      readonly commandName: string;
      readonly failure: CliFailure;
    }
  | {
      readonly kind: 'run';
      readonly command: ParsedCommand;
      readonly globals: Globals;
    };

async function parseCommand(
  registry: readonly CommandSpec[],
  userArgs: readonly string[],
): Promise<ParseResult> {
  let parsed: ParsedCommand | undefined;
  const program = createProgram(registry, (command) => {
    parsed = command;
  });
  try {
    await program.parseAsync(['node', 'gaveta', ...userArgs]);
  } catch (error) {
    if (!(error instanceof CommanderError)) {
      throw error;
    }
    const commandName = firstPositional(userArgs);
    if (
      error.code === 'commander.helpDisplayed' ||
      (error.code === 'commander.help' && !userArgs.includes('--json'))
    ) {
      return { kind: 'help', commandName: knownCommand(registry, commandName) };
    }
    return {
      kind: 'usage',
      commandName,
      failure: new CliFailure('E_ARG_INVALID', {}, { problem: usageProblem(error.code) }),
    };
  }
  if (parsed === undefined) {
    throw new Error('The command action did not run.');
  }
  return { kind: 'run', command: parsed, globals: readGlobals(rawOptions(program)) };
}

async function execute(
  parsed: ParsedCommand,
  globals: Globals,
  io: {
    readonly writers: Writers;
    readonly registry: readonly CommandSpec[];
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly stdin: Readable;
    readonly json: boolean;
  },
): Promise<number> {
  const { spec, positionals } = parsed;
  if (spec.input === 'none' && globals.from !== undefined) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: 'Este comando no admite contenido.' });
  }
  const acceptsPositionals =
    spec.contentArgument !== undefined || (spec.args !== undefined && spec.args.length > 0);
  if (spec.input === 'none' && !acceptsPositionals && positionals.length > 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: 'Este comando no admite contenido.' });
  }
  const vault = await resolveVault(spec, globals, io.cwd, io.env);
  let strictRel = false;
  if (spec.requiresVault) {
    if (vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const config = await readVaultConfig(vault.root);
    strictRel = config.rel.strict;
  }
  const argument = spec.contentArgument === undefined ? undefined : positionals[0];
  const input = await readCommandInput({
    from: globals.from,
    argument,
    stdin: io.stdin,
    cwd: io.cwd,
    required: spec.input === 'required',
  });
  let result: CommandResult;
  try {
    result = await spec.run({
      cwd: io.cwd,
      env: io.env,
      json: io.json,
      vault,
      strictRel,
      input,
      positionals,
      options: parsed.options,
    });
  } catch (error) {
    return reportCaught(io.writers, io.json, spec.name, error, strictRel);
  }
  const warnings = applyWarnings(result.warnings ?? [], strictRel);
  if (!warnings.ok) {
    return writeFailure(io.writers, io.json, spec.name, warnings.error, {
      exitCode: warnings.exitCode,
    });
  }
  if (io.json) {
    io.writers.stdout(
      renderSuccess(spec.name, result.data === undefined ? null : result.data, warnings.warnings),
    );
  } else {
    io.writers.stdout(finishLine(result.human));
    if (warnings.warnings.length > 0) {
      io.writers.stderr(renderHumanWarnings(warnings.warnings));
    }
  }
  return EXIT_CODES.ok;
}

function reportCaught(
  writers: Writers,
  json: boolean,
  commandName: string,
  error: unknown,
  strictRel: boolean,
): number {
  if (error instanceof GavetaError) {
    const exit = exitCodeFor(error.code, strictRel ? { strictRel: true } : {});
    return writeFailure(writers, json, commandName, errorBody(error), {
      exitCode: exit ?? EXIT_CODES.internal,
    });
  }
  return writeFailure(
    writers,
    json,
    commandName,
    {
      code: INTERNAL_ERROR_CODE,
      message: INTERNAL_ERROR_MESSAGE,
      hint: INTERNAL_ERROR_HINT,
    },
    { exitCode: EXIT_CODES.internal },
  );
}

function writeFailure(
  writers: Writers,
  json: boolean,
  commandName: string,
  error: JsonErrorBody | GavetaError,
  options: { readonly exitCode?: number; readonly help?: string } = {},
): number {
  const body = error instanceof GavetaError ? errorBody(error) : error;
  const exitCode =
    options.exitCode ??
    (error instanceof GavetaError
      ? (exitCodeFor(error.code, {}) ?? EXIT_CODES.internal)
      : EXIT_CODES.usage);
  if (json) {
    writers.stdout(renderFailure(commandName, body));
  } else {
    const text = renderHumanError(body);
    writers.stderr(options.help === undefined ? text : `${text}\n${options.help}`);
  }
  return exitCode;
}

function errorBody(error: GavetaError): JsonErrorBody {
  const body: JsonErrorBody = {
    code: error.code,
    message: error.message,
    hint: error.hint,
  };
  if (error instanceof CliFailure && error.details !== undefined) {
    return { ...body, details: error.details };
  }
  return body;
}

function applyWarnings(
  warnings: readonly CommandWarning[],
  strictRel: boolean,
):
  | { readonly ok: true; readonly warnings: readonly JsonWarning[] }
  | { readonly ok: false; readonly error: JsonErrorBody; readonly exitCode: number } {
  const rendered: JsonWarning[] = [];
  for (const warning of warnings) {
    const formatted = formatDiagnostic(warning.code, warning.params ?? {});
    const exit = exitCodeFor(warning.code, strictRel ? { strictRel: true } : {});
    if (exit !== null) {
      return {
        ok: false,
        exitCode: exit,
        error: { code: warning.code, message: formatted.message, hint: formatted.hint },
      };
    }
    rendered.push({ code: warning.code, message: formatted.message, hint: formatted.hint });
  }
  return { ok: true, warnings: rendered };
}

async function resolveVault(
  spec: CommandSpec,
  globals: Globals,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<VaultLocation | null> {
  try {
    return await discoverVault({
      vaultOption: globals.vault,
      env,
      cwd,
    });
  } catch (error) {
    if (
      !spec.requiresVault &&
      !hasExplicitVault(globals.vault, env) &&
      error instanceof GavetaError &&
      error.code === 'E_VAULT_NOT_FOUND'
    ) {
      return null;
    }
    throw error;
  }
}

function hasExplicitVault(vault: string | undefined, env: NodeJS.ProcessEnv): boolean {
  if (vault !== undefined) {
    return true;
  }
  const configured = env[GAVETA_VAULT_ENV];
  return typeof configured === 'string' && configured.length > 0;
}

function knownCommand(registry: readonly CommandSpec[], name: string): string | undefined {
  return registry.some((command) => command.name === name) ? name : undefined;
}

function usageProblem(code: string): string {
  switch (code) {
    case 'commander.unknownCommand':
      return 'El comando no existe.';
    case 'commander.unknownOption':
      return 'La opción no existe.';
    case 'commander.missingArgument':
    case 'commander.optionMissingArgument':
    case 'commander.missingMandatoryOptionValue':
      return 'Falta un argumento.';
    case 'commander.excessArguments':
      return 'Sobran argumentos.';
    case 'commander.invalidArgument':
      return 'El argumento no es válido.';
    case 'commander.help':
      return 'Falta el comando.';
    default:
      return 'Los argumentos no son válidos.';
  }
}

function createProgram(
  registry: readonly CommandSpec[],
  onRun: (command: ParsedCommand) => void,
): Command {
  const program = new Command();
  program
    .name('gaveta')
    .description('Base de conocimiento local. gv es un alias de este binario.')
    .helpCommand(false)
    .helpOption('-h, --help', 'Muestra la ayuda.')
    .showHelpAfterError(false)
    .showSuggestionAfterError(false)
    .exitOverride()
    .configureOutput({
      writeOut() {
        return undefined;
      },
      writeErr() {
        return undefined;
      },
    })
    .option('--json', 'Escribe el sobre JSON versionado en stdout.')
    .option('--vault <dir>', 'Ruta del vault.')
    .option('--from <ruta>', 'Contenido desde un archivo, o - para leer stdin.');

  for (const spec of registry) {
    const command = program.command(spec.name).description(spec.summary);
    if (spec.contentArgument !== undefined) {
      const syntax = spec.contentArgument.required
        ? `<${spec.contentArgument.name}>`
        : `[${spec.contentArgument.name}]`;
      command.argument(syntax, spec.contentArgument.description);
    }
    for (const argument of spec.args ?? []) {
      const syntax = argument.required ? `<${argument.name}>` : `[${argument.name}]`;
      command.argument(syntax, argument.description);
    }
    for (const option of spec.options ?? []) {
      command.option(option.flags, option.description);
    }
    command.action((...params: unknown[]) => {
      const commandObject = params.at(-1);
      if (!(commandObject instanceof Command)) {
        throw new CliFailure('E_ARG_INVALID', {}, { problem: 'Los argumentos no son válidos.' });
      }
      onRun({
        spec,
        positionals: [...commandObject.args],
        options: readCommandOptions(params.at(-2), spec),
      });
    });
  }
  return program;
}

function rawOptions(program: Command): unknown {
  return program.opts();
}

function readGlobals(value: unknown): Globals {
  if (!isRecord(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: 'Los argumentos no son válidos.' });
  }
  if (value.json !== undefined && value.json !== true) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: 'Los argumentos no son válidos.' });
  }
  return {
    json: value.json === true,
    vault: readStringOption(value.vault),
    from: readStringOption(value.from),
  };
}

function readStringOption(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: 'Los argumentos no son válidos.' });
  }
  return value;
}

function readCommandOptions(value: unknown, spec: CommandSpec): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: 'Los argumentos no son válidos.' });
  }
  const allowed = new Set((spec.options ?? []).map((option) => option.name));
  const options: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key)) {
      throw new CliFailure('E_ARG_INVALID', {}, { problem: 'La opción no existe.' });
    }
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new CliFailure('E_ARG_INVALID', {}, { problem: 'El argumento no es válido.' });
    }
    options[key] = entry;
  }
  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finishLine(text: string): string {
  if (text.length === 0 || text.endsWith('\n')) {
    return text;
  }
  return `${text}\n`;
}

function writeStdout(chunk: string): void {
  process.stdout.write(chunk);
}

function writeStderr(chunk: string): void {
  process.stderr.write(chunk);
}
