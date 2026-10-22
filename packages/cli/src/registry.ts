import { adoptCommand } from './commands/adopt.ts';
import {
  backlinksCommand,
  graphCommand,
  linkCommand,
  linksCommand,
} from './commands/connections.ts';
import { doctorCommand } from './commands/doctor.ts';
import { createGuideCommand } from './commands/guide.ts';
import { createSkillCommand } from './commands/skill.ts';
import { initCommand } from './commands/init.ts';
import { mvCommand, rmCommand } from './commands/move-remove.ts';
import { editCommand, newCommand, readCommand } from './commands/notes.ts';
import { reindexCommand } from './commands/reindex.ts';
import { searchCommand } from './commands/search.ts';
import { todoCommand } from './commands/todo.ts';
import { validateCommand } from './commands/validate.ts';
import { updateCommand } from './commands/update.ts';
import { versionCommand } from './commands/version.ts';
import type { CommandSpec } from './types.ts';

const peerCommands: readonly CommandSpec[] = [
  versionCommand,
  updateCommand,
  initCommand,
  adoptCommand,
  searchCommand,
  newCommand,
  readCommand,
  editCommand,
  mvCommand,
  rmCommand,
  linksCommand,
  backlinksCommand,
  linkCommand,
  graphCommand,
  todoCommand,
  validateCommand,
  doctorCommand,
  reindexCommand,
];

const skillCommand = createSkillCommand(peerCommands);
const guidePeerCommands: readonly CommandSpec[] = [...peerCommands, skillCommand];

/** Commands the binary exposes. Later tasks append here; `guide` reads this list. */
export const commands: readonly CommandSpec[] = [
  ...guidePeerCommands,
  createGuideCommand(guidePeerCommands),
];
