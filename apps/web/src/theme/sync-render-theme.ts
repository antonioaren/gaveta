import type { ResolvedTheme } from './theme-preference.ts';

const THEME_MESSAGE = 'gaveta:theme';

export function postThemeToRenderIframe(
  iframeWindow: Window | null,
  resolved: ResolvedTheme,
): void {
  if (iframeWindow === null) {
    return;
  }
  try {
    iframeWindow.postMessage({ type: THEME_MESSAGE, theme: resolved }, '*');
  } catch {
    // Cross-origin or detached frame.
  }
}
