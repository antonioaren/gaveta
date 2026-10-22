import { searchCommand } from './commands/search.ts';
import { versionCommand } from './commands/version.ts';
import type { CommandSpec } from './types.ts';

/** Commands the binary exposes. Later tasks append here; `guide` reads this list. */
export const commands: readonly CommandSpec[] = [versionCommand, searchCommand];
