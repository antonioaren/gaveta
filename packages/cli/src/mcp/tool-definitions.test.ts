import { expect, it } from 'vitest';
import { commands } from '../registry.ts';
import { MCP_EXCLUDED_COMMANDS } from './excluded.ts';
import { listMcpToolDefinitions, mcpToolName } from './tool-definitions.ts';

it('excludes mcp and serve from MCP tools', () => {
  expect(MCP_EXCLUDED_COMMANDS.has('mcp')).toBe(true);
  expect(MCP_EXCLUDED_COMMANDS.has('serve')).toBe(true);
  const names = listMcpToolDefinitions(commands).map((tool) => tool.name);
  expect(names).not.toContain('mcp');
  expect(names).not.toContain('serve');
});

it('maps subcommands to underscore tool names', () => {
  expect(mcpToolName({ name: 'todo' } as never, { name: 'add' } as never)).toBe('todo_add');
  expect(mcpToolName({ name: 'new' } as never, undefined)).toBe('new');
});

it('includes REQ-CLI-14 and REQ-MIG-13 commands', () => {
  const names = new Set(listMcpToolDefinitions(commands).map((tool) => tool.name));
  for (const required of [
    'new',
    'read',
    'edit',
    'search',
    'links',
    'backlinks',
    'link',
    'graph',
    'validate',
    'guide',
    'import',
    'export',
  ]) {
    expect(names.has(required)).toBe(true);
  }
  for (const todo of ['todo_add', 'todo_check', 'todo_uncheck', 'todo_list']) {
    expect(names.has(todo)).toBe(true);
  }
});

it('registers one tool per CLI leaf command', () => {
  const registryNames = commands
    .filter((command) => !MCP_EXCLUDED_COMMANDS.has(command.name))
    .flatMap((command) =>
      command.subcommands !== undefined && command.subcommands.length > 0
        ? command.subcommands.map((sub) => `${command.name}_${sub.name}`)
        : [command.name],
    );
  const mcpNames = listMcpToolDefinitions(commands).map((tool) => tool.name);
  expect(mcpNames.sort()).toEqual(registryNames.sort());
});
