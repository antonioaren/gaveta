import { expect, it } from 'vitest';
import { hasNodeErrorCode, nodeErrorCode } from './node-error.ts';

it('reads only string codes from thrown values', () => {
  expect(nodeErrorCode('nope')).toBeUndefined();
  expect(nodeErrorCode(null)).toBeUndefined();
  expect(nodeErrorCode(undefined)).toBeUndefined();
  expect(nodeErrorCode({})).toBeUndefined();
  expect(nodeErrorCode({ code: 1 })).toBeUndefined();
  expect(nodeErrorCode({ code: 'ENOENT' })).toBe('ENOENT');
  expect(hasNodeErrorCode({ code: 'ENOENT' }, 'ENOENT')).toBe(true);
  expect(hasNodeErrorCode({ code: 'ENOENT' }, 'ELOOP')).toBe(false);
});
