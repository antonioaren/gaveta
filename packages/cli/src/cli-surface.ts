import type { CommandSpec } from './types.ts';

export const GLOBAL_CLI_FLAGS = new Set([
  '--json',
  '--vault',
  '--from',
  '--lang',
  '-h',
  '--help',
  '-V',
  '--version',
]);

export interface CliSurface {
  readonly commands: ReadonlySet<string>;
  readonly subcommands: ReadonlyMap<string, ReadonlySet<string>>;
  readonly flagsFor: (command: string, subcommand?: string) => ReadonlySet<string>;
}

function flagNamesFromSpec(flags: string): string[] {
  const names: string[] = [];
  const parts = flags.split(/,\s*/);
  for (const part of parts) {
    const trimmed = part.trim();
    const long = /--[a-z0-9-]+/i.exec(trimmed);
    if (long !== null) {
      names.push(long[0]);
    }
    const short = /(?:^|\s)(-[a-zA-Z])\b/.exec(trimmed);
    const shortName = short?.[1];
    if (shortName !== undefined) {
      names.push(shortName);
    }
  }
  return names;
}

function collectOptionFlags(options: readonly { flags: string }[] | undefined): Set<string> {
  const result = new Set<string>();
  for (const option of options ?? []) {
    for (const name of flagNamesFromSpec(option.flags)) {
      result.add(name);
    }
  }
  return result;
}

/** Registry-derived command and flag names for validating skill text. */
export function buildCliSurface(registry: readonly CommandSpec[]): CliSurface {
  const commands = new Set<string>();
  const subcommands = new Map<string, Set<string>>();
  const flagMap = new Map<string, Set<string>>();

  for (const command of registry) {
    commands.add(command.name);
    const parentFlags = collectOptionFlags(command.options);
    flagMap.set(command.name, parentFlags);

    if (command.subcommands !== undefined && command.subcommands.length > 0) {
      const subs = new Set<string>();
      for (const sub of command.subcommands) {
        subs.add(sub.name);
        const subFlags = new Set([...parentFlags, ...collectOptionFlags(sub.options)]);
        flagMap.set(`${command.name}:${sub.name}`, subFlags);
      }
      subcommands.set(command.name, subs);
    }
  }

  return {
    commands,
    subcommands,
    flagsFor(command: string, subcommand?: string): ReadonlySet<string> {
      const key = subcommand === undefined ? command : `${command}:${subcommand}`;
      return flagMap.get(key) ?? new Set();
    },
  };
}
