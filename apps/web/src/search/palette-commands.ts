export interface PaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly keywords: readonly string[];
}

export const NAVIGATION_COMMANDS: readonly PaletteCommand[] = [
  { id: 'nav-back', label: 'Atrás', keywords: ['atras', 'atrás', 'back', 'historial'] },
  { id: 'nav-forward', label: 'Adelante', keywords: ['adelante', 'forward', 'historial'] },
];

export function filterPaletteCommands(query: string): readonly PaletteCommand[] {
  const folded = query.trim().toLowerCase();
  if (folded.length === 0) {
    return NAVIGATION_COMMANDS;
  }
  return NAVIGATION_COMMANDS.filter((command) => {
    if (command.label.toLowerCase().includes(folded)) {
      return true;
    }
    return command.keywords.some((keyword) => keyword.includes(folded));
  });
}
