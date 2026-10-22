import { expect, it } from 'vitest';
import { isAllowedGavetaRemote } from './remote.ts';

it('accepts only exact official GitHub remote forms', () => {
  expect(isAllowedGavetaRemote('https://github.com/antonioaren/gaveta.git')).toBe(true);
  expect(isAllowedGavetaRemote('https://github.com/antonioaren/gaveta')).toBe(true);
  expect(isAllowedGavetaRemote('git@github.com:antonioaren/gaveta.git')).toBe(true);
  expect(isAllowedGavetaRemote('ssh://git@github.com/antonioaren/gaveta.git')).toBe(true);
  expect(isAllowedGavetaRemote('https://github.com/antonioaren/gaveta/')).toBe(true);
});

it('rejects lookalike hosts and path suffix tricks', () => {
  expect(isAllowedGavetaRemote('https://evil.example/gaveta.git')).toBe(false);
  expect(isAllowedGavetaRemote('https://evil.example/antonioaren/gaveta')).toBe(false);
  expect(isAllowedGavetaRemote('https://github.com.evil/antonioaren/gaveta.git')).toBe(false);
  expect(isAllowedGavetaRemote('https://notgithub.com/antonioaren/gaveta')).toBe(false);
});
