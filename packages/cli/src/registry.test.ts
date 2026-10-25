import { expect, it } from 'vitest';
import { commands } from './registry.ts';
import { renderHelp } from './help.ts';
import { m } from './messages.ts';

it('registers version, init, adopt, search, new, read, edit, mv, rm, connection, todo, validate, doctor, reindex, and guide commands', () => {
  expect(commands.map((command) => command.name)).toEqual([
    'version',
    'update',
    'init',
    'adopt',
    'search',
    'new',
    'read',
    'edit',
    'mv',
    'rm',
    'mkdir',
    'mv-folder',
    'rm-folder',
    'meta',
    'links',
    'backlinks',
    'link',
    'graph',
    'todo',
    'validate',
    'doctor',
    'reindex',
    'import',
    'export',
    'serve',
    'mcp',
    'skill',
    'guide',
  ]);
  const names = new Set(commands.map((command) => command.name));
  expect(names.size).toBe(commands.length);
});

it('gives every command a summary and an example the guide can print', () => {
  for (const command of commands) {
    expect(command.summary.length).toBeGreaterThan(0);
    expect(command.example).toContain(command.name);
    expect(command.example.startsWith('gaveta ')).toBe(true);
    for (const sub of command.subcommands ?? []) {
      expect(sub.example).toContain(command.name);
      expect(sub.example).toContain(sub.name);
    }
  }
});

it('documents init targets and the adopt path in Spanish help', () => {
  const initHelp = renderHelp(commands, 'init');
  expect(initHelp).toContain('--agent-instructions');
  expect(initHelp).toContain('CLAUDE.md');
  expect(initHelp).toContain('AGENTS.md');
  expect(initHelp).toContain('.cursor/rules/gaveta.mdc');
  expect(initHelp).toContain('.github/copilot-instructions.md');
  expect(initHelp).not.toContain('Usage:');
  expect(renderHelp(commands, 'adopt')).toContain('<ruta>');
  expect(renderHelp(commands, 'adopt')).toContain('gaveta adopt nota.html');
});

it('lists every registered command and its example in the help text', () => {
  const help = renderHelp(commands);
  expect(help).toContain('Uso: gaveta');
  expect(help).toContain('gv es un alias');
  expect(help).not.toContain('Usage:');
  for (const command of commands) {
    expect(help).toContain(command.name);
    expect(help).toContain(m(command.summary));
    expect(help).toContain(command.example);
  }
  expect(renderHelp(commands, 'version')).toContain('gaveta version --json');
  const searchHelp = renderHelp(commands, 'search');
  expect(searchHelp).toContain('Uso: gaveta search <consulta> [opciones]');
  expect(searchHelp).toContain('--type <tipo>');
  expect(searchHelp).toContain('--tag <etiqueta>');
  expect(searchHelp).toContain('--limit <n>');
  expect(searchHelp).toContain('gaveta search "base de datos" --json');
});
