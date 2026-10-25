// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { renderWithI18n } from '../i18n/render-with-i18n.tsx';
import { afterEach } from 'vitest';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { parseReloadGenerationFromIframeSrc } from './render-frame.ts';
import { NoteRenderFrame } from './NoteRenderFrame.tsx';

const noop: Mock = vi.fn();

vi.mock('./useRenderFrameUrl.ts', () => ({
  useRenderFrameUrl: () => '/render/01NOTE?t=abc',
}));

function iframeElement(): HTMLIFrameElement {
  const iframe = document.querySelector('iframe');
  if (!(iframe instanceof HTMLIFrameElement)) {
    throw new Error('expected iframe');
  }
  return iframe;
}

afterEach(() => {
  cleanup();
});

describe('NoteRenderFrame', () => {
  it('remounts the iframe for each reload generation', () => {
    const { rerender } = renderWithI18n(
      <NoteRenderFrame noteId="01NOTE" title="Nota" reloadGeneration={1} onIframeWindow={noop} />,
      { locale: 'es' },
    );
    const first = iframeElement();
    expect(parseReloadGenerationFromIframeSrc(first.src)).toBe(1);

    act(() => {
      rerender(
        <NoteRenderFrame noteId="01NOTE" title="Nota" reloadGeneration={3} onIframeWindow={noop} />,
      );
    });
    const second = iframeElement();
    expect(second).not.toBe(first);
    expect(parseReloadGenerationFromIframeSrc(second.src)).toBe(3);
  });

  it('ignores a late load on a detached iframe after a newer generation mounted', () => {
    const { rerender } = renderWithI18n(
      <NoteRenderFrame noteId="01NOTE" title="Nota" reloadGeneration={1} onIframeWindow={noop} />,
      { locale: 'es' },
    );
    const stale = iframeElement();

    act(() => {
      rerender(
        <NoteRenderFrame noteId="01NOTE" title="Nota" reloadGeneration={2} onIframeWindow={noop} />,
      );
    });
    const current = iframeElement();
    expect(stale.isConnected).toBe(false);

    act(() => {
      stale.src = 'http://127.0.0.1/render/01NOTE?t=abc&_g=1';
      stale.dispatchEvent(new Event('load'));
    });

    expect(parseReloadGenerationFromIframeSrc(current.src)).toBe(2);
    expect(current.isConnected).toBe(true);
    expect(document.querySelectorAll('iframe').length).toBe(1);
  });
});
