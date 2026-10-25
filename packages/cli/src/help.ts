import { getActiveLocale, t, type MessageKey } from '@gaveta/i18n';
import { m } from './messages.ts';
import type { CommandSpec } from './types.ts';

function loc(key: MessageKey): string {
  return t(key, getActiveLocale());
}

function optionLines(): string[] {
  return [
    `  --json             ${loc('cli.help.globalJson')}`,
    `  --vault <dir>      ${loc('cli.help.globalVault')}`,
    `  --from <ruta|->    ${loc('cli.help.globalFrom')}`,
    `  --lang <en|es>     ${loc('cli.help.globalLang')}`,
    `  -h, --help         ${loc('cli.help.globalHelp')}`,
    `  -V, --version      ${loc('cli.help.globalVersion')}`,
  ];
}

/** Localized help. Commander's built-in help is English, so the CLI prints this instead. */
export function renderHelp(registry: readonly CommandSpec[], commandName?: string): string {
  if (commandName !== undefined && commandName.length > 0) {
    const command = registry.find((item) => item.name === commandName);
    if (command !== undefined) {
      const subcommandLines =
        command.subcommands === undefined
          ? []
          : [
              '',
              loc('cli.help.subcommands'),
              ...command.subcommands.map((sub) => `  ${sub.name.padEnd(8)}  ${m(sub.summary)}`),
            ];
      return [
        usageLine(command),
        '',
        m(command.summary),
        '',
        `${loc('cli.help.examplePrefix')} ${command.example}`,
        ...subcommandLines,
        '',
        ...optionBlock(command),
        '',
      ].join('\n');
    }
  }

  const width = registry.reduce((longest, command) => Math.max(longest, command.name.length), 0);
  const commandLines = registry.map(
    (command) => `  ${command.name.padEnd(width)}  ${m(command.summary)}`,
  );
  return [
    loc('cli.help.usageRoot'),
    '',
    loc('cli.help.tagline'),
    '',
    loc('cli.help.options'),
    ...optionLines(),
    '',
    loc('cli.help.commands'),
    ...commandLines,
    '',
    loc('cli.help.examples'),
    ...registry.map((command) => `  ${command.example}`),
    '',
  ].join('\n');
}

function usageLine(command: CommandSpec): string {
  const args = (command.args ?? [])
    .map((argument) => (argument.required ? `<${argument.name}>` : `[${argument.name}]`))
    .join(' ');
  if (args.length === 0) {
    return t('cli.help.usageCommand', getActiveLocale(), { name: command.name });
  }
  return t('cli.help.usageCommandArgs', getActiveLocale(), { name: command.name, args });
}

function optionBlock(command: CommandSpec): string[] {
  const specific = commandOptionLines(command);
  const lines = optionLines();
  if (specific.length === 0) {
    return [loc('cli.help.options'), ...lines];
  }
  return [loc('cli.help.options'), ...lines, '', loc('cli.help.commandOptions'), ...specific];
}

function commandOptionLines(command: CommandSpec): string[] {
  const options = command.options ?? [];
  if (options.length === 0) {
    return [];
  }
  const width = options.reduce((longest, option) => Math.max(longest, option.flags.length), 0);
  return options.map((option) => `  ${option.flags.padEnd(width)}  ${m(option.description)}`);
}
