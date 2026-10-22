import { adoptCommand } from './commands/adopt.ts';
import { initCommand } from './commands/init.ts';
import { mvCommand, rmCommand } from './commands/move-remove.ts';
import { editCommand, newCommand, readCommand } from './commands/notes.ts';
import { searchCommand } from './commands/search.ts';
import { versionCommand } from './commands/version.ts';
import type { CommandSpec } from './types.ts';

/** Commands the binary exposes. Later tasks append here; `guide` reads this list. */
export const commands: readonly CommandSpec[] = [
  versionCommand,
  initCommand,
  adoptCommand,
  searchCommand,
  newCommand,
  readCommand,
  editCommand,
  mvCommand,
  rmCommand,
];
