import type { VaultLocation, WarningCode } from '@gaveta/core';

/** Where note content came from. Later commands receive it already loaded. */
export type InputSource = 'argument' | 'file' | 'stdin';

export interface ResolvedInput {
  readonly text: string;
  readonly source: InputSource;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CommandWarning {
  readonly code: WarningCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface CommandEmit {
  success(data: unknown, warnings?: readonly CommandWarning[]): void;
  stdout(text: string): void;
}

export interface CommandResult {
  readonly data: unknown;
  readonly human: string;
  readonly warnings?: readonly CommandWarning[];
  /** When set, overrides the default success exit code (0). */
  readonly exitCode?: number;
  /** Long-running commands print success via `emit` and skip the final envelope. */
  readonly deferSuccessOutput?: boolean;
}

export type CommandInputMode = 'none' | 'optional' | 'required';

/** A positional argument that is not note content. */
export interface CommandArgument {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
}

/** A command-specific option. `name` is the key Commander stores. */
export interface CommandOption {
  readonly name: string;
  readonly flags: string;
  readonly description: string;
  readonly choices?: readonly string[];
  /** Boolean flags are stored as `'true'` only when the user passes them. */
  readonly kind?: 'string' | 'boolean' | 'stringList';
}

/** Separator for repeatable string options in `CommandContext.options`. */
export const STRING_LIST_SEPARATOR = '\u001e';

/** A subcommand of a parent CLI command (for example `todo add`). */
export interface CommandSubSpec {
  readonly name: string;
  readonly summary: string;
  readonly example: string;
  readonly input?: CommandInputMode;
  readonly args?: readonly CommandArgument[];
  readonly options?: readonly CommandOption[];
  run(context: CommandContext): CommandResult | Promise<CommandResult>;
}

/**
 * One CLI command. `guide` (T1.21) is generated from this registry:
 * every command needs a summary and an example.
 */
export interface CommandSpec {
  readonly name: string;
  readonly summary: string;
  readonly example: string;
  readonly requiresVault: boolean;
  /** Skip vault discovery entirely, for commands that create the vault. */
  readonly skipsVaultDiscovery?: boolean;
  readonly input: CommandInputMode;
  readonly contentArgument?: {
    readonly name: string;
    readonly description: string;
    readonly required: boolean;
  };
  readonly args?: readonly CommandArgument[];
  readonly options?: readonly CommandOption[];
  readonly subcommands?: readonly CommandSubSpec[];
  run?(context: CommandContext): CommandResult | Promise<CommandResult>;
}

export interface CommandContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly json: boolean;
  readonly vaultOption: string | undefined;
  readonly vault: VaultLocation | null;
  readonly strictRel: boolean;
  readonly input: ResolvedInput | null;
  readonly positionals: readonly string[];
  readonly options: Readonly<Record<string, string>>;
  readonly subcommand?: string;
  /** Writers for long-running commands that print before shutdown. */
  readonly emit?: CommandEmit;
}
