import { appendRenderReloadQuery } from './render-frame.ts';

export function parseReloadGenerationFromIframeSrc(src: string): number {
  try {
    const url = new URL(src, 'http://127.0.0.1');
    const generation = url.searchParams.get('_g');
    return generation === null ? 0 : Number.parseInt(generation, 10);
  } catch {
    const match = /[?&]_g=(\d+)/.exec(src);
    const generation = match?.[1];
    return generation === undefined ? 0 : Number.parseInt(generation, 10);
  }
}

export function needsFollowUpReload(loadedGeneration: number, latestGeneration: number): boolean {
  return latestGeneration > loadedGeneration;
}

export type GetLatestReloadGeneration = () => number;

export function navigateIframeToRenderGeneration(
  iframe: HTMLIFrameElement,
  renderSrc: string,
  reloadGeneration: number,
): void {
  if (reloadGeneration <= 0) {
    return;
  }
  iframe.src = appendRenderReloadQuery(renderSrc, reloadGeneration);
}

/** Re-navigate when a stale load finishes after newer note:changed events. */
export function attachLiveReloadFollowUp(
  iframe: HTMLIFrameElement,
  renderSrc: string,
  getLatestGeneration: GetLatestReloadGeneration,
): () => void {
  const onLoad = (): void => {
    const latest = getLatestGeneration();
    const loaded = parseReloadGenerationFromIframeSrc(iframe.src);
    if (needsFollowUpReload(loaded, latest)) {
      navigateIframeToRenderGeneration(iframe, renderSrc, latest);
    }
  };
  iframe.addEventListener('load', onLoad);
  return () => {
    iframe.removeEventListener('load', onLoad);
  };
}
