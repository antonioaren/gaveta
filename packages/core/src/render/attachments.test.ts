import { expect, it } from 'vitest';
import {
  assertNoteAttachmentPathAllowed,
  collectNoteAttachmentPaths,
  isBlockedRenderVaultPath,
} from './attachments.ts';

it('collects the same attachment paths as export for media and local links', () => {
  const html = `<article>
<p><a href="attachments/doc.pdf">PDF</a></p>
<video src="attachments/clip.mp3" poster="attachments/poster.png"></video>
<img src="attachments/pixel.png" alt="">
</article>`;
  expect(collectNoteAttachmentPaths(html, 'notes/demo.html')).toEqual([
    'notes/attachments/clip.mp3',
    'notes/attachments/doc.pdf',
    'notes/attachments/pixel.png',
    'notes/attachments/poster.png',
  ]);
});

it('blocks sensitive vault paths for render file serving', () => {
  expect(isBlockedRenderVaultPath('.gaveta/index.sqlite')).toBe(true);
  expect(isBlockedRenderVaultPath('.gaveta/theme.css')).toBe(true);
  expect(isBlockedRenderVaultPath('secret/.hidden')).toBe(true);
  expect(isBlockedRenderVaultPath('other.html')).toBe(true);
  expect(isBlockedRenderVaultPath('attachments/pixel.png')).toBe(false);
});

it('allows only paths referenced by the note', () => {
  const allowed = new Set(['attachments/pixel.png']);
  expect(() => {
    assertNoteAttachmentPathAllowed('attachments/pixel.png', allowed);
  }).not.toThrow();
  expect(() => {
    assertNoteAttachmentPathAllowed('attachments/other.png', allowed);
  }).toThrow();
});
