import { expect, it } from 'vitest';
import { contentDispositionForVaultFile } from './render-file.ts';

it('forces attachment disposition for svg assets', () => {
  expect(contentDispositionForVaultFile('attachments/diagram.svg')).toBe(
    'attachment; filename="diagram.svg"',
  );
});

it('uses inline disposition for other render files', () => {
  expect(contentDispositionForVaultFile('attachments/pixel.png')).toBe(
    'inline; filename="pixel.png"',
  );
});
