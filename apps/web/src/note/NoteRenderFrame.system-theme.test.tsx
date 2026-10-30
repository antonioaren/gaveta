// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../i18n/render-with-i18n.tsx';
import { writeThemePreference } from '../theme/theme-preference.ts';
import { NoteRenderFrame } from './NoteRenderFrame.tsx';

const noop = vi.fn();

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

describe('NoteRenderFrame system theme', () => {
  let prefersDark: boolean;
  let changeListeners: (() => void)[];

  beforeEach(() => {
    prefersDark = false;
    changeListeners = [];
    localStorage.clear();
    writeThemePreference('system');

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
        matches: prefersDark,
        media: query,
        addEventListener: (_event: string, listener: () => void) => {
          changeListeners.push(listener);
        },
        removeEventListener: (_event: string, listener: () => void) => {
          changeListeners = changeListeners.filter((entry) => entry !== listener);
        },
      })),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('re-posts gaveta:theme to the iframe when OS color scheme changes in system mode', () => {
    const postMessage = vi.fn();
    renderWithI18n(
      <NoteRenderFrame noteId="01NOTE" title="Note" reloadGeneration={0} onIframeWindow={noop} />,
      { locale: 'en' },
    );

    const iframe = iframeElement();
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      get: () => ({ postMessage }),
    });

    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });

    postMessage.mockClear();

    prefersDark = true;
    act(() => {
      for (const listener of changeListeners) {
        listener();
      }
    });

    expect(postMessage).toHaveBeenCalledWith({ type: 'gaveta:theme', theme: 'dark' }, '*');
  });
});
