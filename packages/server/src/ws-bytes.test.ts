import { expect, it } from 'vitest';
import { rawDataByteLength } from './ws-bytes.ts';

it('measures utf-8 bytes instead of code units', () => {
  const text = `{"type":"auth","token":"${'é'.repeat(100)}"}`;
  expect(text.length).toBeLessThan(Buffer.byteLength(text, 'utf8'));
  expect(rawDataByteLength(Buffer.from(text, 'utf8'))).toBe(Buffer.byteLength(text, 'utf8'));
});
