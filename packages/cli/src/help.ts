import type { CommandSpec } from './types.ts';

const OPTION_LINES = [
  '  --json             Escribe el sobre JSON versionado en stdout',
  '  --vault <dir>      Ruta del vault. Si se omite, se usa GAVETA_VAULT o se busca .gaveta/ hacia arriba',
  '  --from <ruta|->    Contenido desde un archivo, o - para leer stdin',
  '  -h, --help         Muestra la ayuda',
  '  -V, --version      Muestra la versión',
];

/** Spanish help. Commander's built-in help is English, so the CLI prints this instead. */
export function renderHelp(registry: readonly CommandSpec[], commandName?: string): string {
  if (commandName !== undefined && commandName.length > 0) {
    const command = registry.find((item) => item.name === commandName);
    if (command !== undefined) {
      return [
        usageLine(command),
        '',
        command.summary,
        '',
        `Ejemplo: ${command.example}`,
        '',
        ...optionBlock(command),
        '',
      ].join('\n');
    }
  }

  const width = registry.reduce((longest, command) => Math.max(longest, command.name.length), 0);
  const commandLines = registry.map(
    (command) => `  ${command.name.padEnd(width)}  ${command.summary}`,
  );
  return [
    'Uso: gaveta [opciones] [comando]',
    '',
    'Base de conocimiento local. gv es un alias de este binario.',
    '',
    'Opciones:',
    ...OPTION_LINES,
    '',
    'Comandos:',
    ...commandLines,
    '',
    'Ejemplos:',
    ...registry.map((command) => `  ${command.example}`),
    '',
  ].join('\n');
}

function usageLine(command: CommandSpec): string {
  const args = (command.args ?? [])
    .map((argument) => (argument.required ? `<${argument.name}>` : `[${argument.name}]`))
    .join(' ');
  if (args.length === 0) {
    return `Uso: gaveta ${command.name} [opciones]`;
  }
  return `Uso: gaveta ${command.name} ${args} [opciones]`;
}

function optionBlock(command: CommandSpec): string[] {
  const specific = commandOptionLines(command);
  if (specific.length === 0) {
    return ['Opciones:', ...OPTION_LINES];
  }
  return ['Opciones:', ...OPTION_LINES, '', 'Opciones del comando:', ...specific];
}

function commandOptionLines(command: CommandSpec): string[] {
  const options = command.options ?? [];
  if (options.length === 0) {
    return [];
  }
  const width = options.reduce((longest, option) => Math.max(longest, option.flags.length), 0);
  return options.map((option) => `  ${option.flags.padEnd(width)}  ${option.description}`);
}
