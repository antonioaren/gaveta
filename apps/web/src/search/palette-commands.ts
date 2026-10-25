import type { WebTranslate } from '../new-note/format-api-error.ts';

export interface PaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly keywords: readonly string[];
}

export function navigationCommands(t: WebTranslate): readonly PaletteCommand[] {
  return [
    {
      id: 'nav-back',
      label: t('web.palette.command.navBack'),
      keywords: ['atras', 'back', 'historial'],
    },
    {
      id: 'nav-forward',
      label: t('web.palette.command.navForward'),
      keywords: ['adelante', 'forward', 'historial'],
    },
  ];
}

export function filterPaletteCommands(
  commands: readonly PaletteCommand[],
  query: string,
): readonly PaletteCommand[] {
  const folded = query.trim().toLowerCase();
  if (folded.length === 0) {
    return commands;
  }
  return commands.filter((command) => {
    if (command.label.toLowerCase().includes(folded)) {
      return true;
    }
    return command.keywords.some((keyword) => keyword.includes(folded));
  });
}
