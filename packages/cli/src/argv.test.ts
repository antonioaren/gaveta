import { expect, it } from 'vitest';
import { firstPositional, normalizeArgv } from './argv.ts';

it('turns --version and -V into the version command', () => {
  expect(normalizeArgv(['--version'])).toEqual(['version']);
  expect(normalizeArgv(['-V', '--json'])).toEqual(['--json', 'version']);
  expect(normalizeArgv(['version', '--version'])).toEqual(['version']);
  expect(normalizeArgv(['--json', 'version'])).toEqual(['--json', 'version']);
});

it('does not treat a --from value named version as the version flag', () => {
  expect(normalizeArgv(['--from', 'version', '--version'])).toEqual([
    '--from',
    'version',
    'version',
  ]);
});

it('finds the command token and skips option values', () => {
  expect(firstPositional(['--json', 'version'])).toBe('version');
  expect(firstPositional(['--vault', '/tmp/vault', 'version', '--from', '-'])).toBe('version');
  expect(firstPositional(['--from=nota.html', '--json'])).toBe('');
  expect(firstPositional(['nope'])).toBe('nope');
  expect(firstPositional(['--help'])).toBe('');
});
