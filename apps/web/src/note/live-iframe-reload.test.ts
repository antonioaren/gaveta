// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachLiveReloadFollowUp,
  navigateIframeToRenderGeneration,
  needsFollowUpReload,
  parseReloadGenerationFromIframeSrc,
} from './live-iframe-reload.ts';

describe('live-iframe-reload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('needsFollowUpReload when latest generation is ahead of the loaded iframe', () => {
    expect(needsFollowUpReload(1, 3)).toBe(true);
    expect(needsFollowUpReload(3, 3)).toBe(false);
    expect(needsFollowUpReload(4, 3)).toBe(false);
  });

  it('parses _g from iframe src', () => {
    expect(parseReloadGenerationFromIframeSrc('http://127.0.0.1/render/01NOTE?t=abc&_g=2')).toBe(2);
    expect(parseReloadGenerationFromIframeSrc('/render/01NOTE?t=abc')).toBe(0);
  });

  it('follows up after a stale load when note:changed events arrived in flight', () => {
    const iframe = document.createElement('iframe');
    const renderSrc = '/render/01NOTE?t=abc';
    let latestGeneration = 1;
    const detach = attachLiveReloadFollowUp(iframe, renderSrc, () => latestGeneration);

    navigateIframeToRenderGeneration(iframe, renderSrc, 1);
    latestGeneration = 3;
    iframe.src = 'http://127.0.0.1/render/01NOTE?t=abc&_g=1';
    iframe.dispatchEvent(new Event('load'));

    expect(parseReloadGenerationFromIframeSrc(iframe.src)).toBe(3);
    detach();
  });

  it('applies successive generations without dropping the last reload', () => {
    const iframe = document.createElement('iframe');
    const renderSrc = '/render/01NOTE?t=abc';
    let latestGeneration = 0;
    const detach = attachLiveReloadFollowUp(iframe, renderSrc, () => latestGeneration);

    for (const generation of [1, 2, 3]) {
      latestGeneration = generation;
      navigateIframeToRenderGeneration(iframe, renderSrc, generation);
    }
    iframe.src = 'http://127.0.0.1/render/01NOTE?t=abc&_g=1';
    iframe.dispatchEvent(new Event('load'));

    expect(parseReloadGenerationFromIframeSrc(iframe.src)).toBe(3);
    detach();
  });
});
