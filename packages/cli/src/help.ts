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
        `Uso: gaveta ${command.name} [opciones]`,
        '',
        command.summary,
        '',
        `Ejemplo: ${command.example}`,
        '',
        'Opciones:',
        ...OPTION_LINES,
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
