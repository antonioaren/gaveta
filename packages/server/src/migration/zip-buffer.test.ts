import { expect, it } from 'vitest';
import { createZipBuffer } from './zip-buffer.ts';

it('creates a zip with stored entries', () => {
  const zip = createZipBuffer([
    { path: 'a/hello.md', data: Buffer.from('# Hola\n') },
    { path: 'b/world.md', data: Buffer.from('# Mundo\n') },
  ]);
  expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
  expect(zip.includes(Buffer.from('hello.md'))).toBe(true);
});
