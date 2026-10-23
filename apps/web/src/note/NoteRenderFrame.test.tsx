// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';

const noop: Mock = vi.fn();
import { parseReloadGenerationFromIframeSrc } from './live-iframe-reload.ts';
import { NoteRenderFrame } from './NoteRenderFrame.tsx';

vi.mock('./useRenderFrameUrl.ts', () => ({
  useRenderFrameUrl: () => '/render/01NOTE?t=abc',
}));

describe('NoteRenderFrame', () => {
  it('ends on the latest reload generation after rapid note:changed updates', () => {
    const { rerender } = render(
      <NoteRenderFrame noteId="01NOTE" title="Nota" reloadGeneration={1} onIframeWindow={noop} />,
    );
    const iframe = document.querySelector('iframe');
    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error('expected iframe');
    }
    expect(parseReloadGenerationFromIframeSrc(iframe.src)).toBe(1);

    act(() => {
      rerender(
        <NoteRenderFrame noteId="01NOTE" title="Nota" reloadGeneration={2} onIframeWindow={noop} />,
      );
      rerender(
        <NoteRenderFrame noteId="01NOTE" title="Nota" reloadGeneration={3} onIframeWindow={noop} />,
      );
    });
    expect(parseReloadGenerationFromIframeSrc(iframe.src)).toBe(3);

    act(() => {
      iframe.src = 'http://127.0.0.1/render/01NOTE?t=abc&_g=1';
      iframe.dispatchEvent(new Event('load'));
    });
    expect(parseReloadGenerationFromIframeSrc(iframe.src)).toBe(3);
  });
});
