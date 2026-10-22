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

export interface CommandResult {
  readonly data: unknown;
  readonly human: string;
  readonly warnings?: readonly CommandWarning[];
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
  readonly input: CommandInputMode;
  readonly contentArgument?: {
    readonly name: string;
    readonly description: string;
    readonly required: boolean;
  };
  readonly args?: readonly CommandArgument[];
  readonly options?: readonly CommandOption[];
  run(context: CommandContext): CommandResult | Promise<CommandResult>;
}

export interface CommandContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly json: boolean;
  readonly vault: VaultLocation | null;
  readonly strictRel: boolean;
  readonly input: ResolvedInput | null;
  readonly positionals: readonly string[];
  readonly options: Readonly<Record<string, string>>;
}
