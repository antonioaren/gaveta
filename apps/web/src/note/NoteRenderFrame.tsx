import { useEffect, useRef } from 'react';
import {
  attachLiveReloadFollowUp,
  navigateIframeToRenderGeneration,
} from './live-iframe-reload.ts';
import { useRenderFrameUrl } from './useRenderFrameUrl.ts';

interface NoteRenderFrameProps {
  readonly noteId: string;
  readonly title: string;
  readonly reloadGeneration: number;
  readonly onIframeWindow: (window: Window | null) => void;
  readonly onIframeLoad?: () => void;
}

export function NoteRenderFrame({
  noteId,
  title,
  reloadGeneration,
  onIframeWindow,
  onIframeLoad,
}: NoteRenderFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestReloadGenerationRef = useRef(reloadGeneration);
  const renderSrc = useRenderFrameUrl(noteId);

  useEffect(() => {
    latestReloadGenerationRef.current = reloadGeneration;
  }, [reloadGeneration]);

  useEffect(() => {
    if (reloadGeneration === 0 || renderSrc === null) {
      return;
    }
    const iframe = iframeRef.current;
    if (iframe === null) {
      return;
    }
    navigateIframeToRenderGeneration(iframe, renderSrc, reloadGeneration);
    return attachLiveReloadFollowUp(iframe, renderSrc, () => latestReloadGenerationRef.current);
  }, [reloadGeneration, renderSrc]);

  const syncWindow = (): void => {
    onIframeWindow(iframeRef.current?.contentWindow ?? null);
  };

  return renderSrc === null ? (
    <p className="note-pane__placeholder">Preparando vista…</p>
  ) : (
    <iframe
      ref={iframeRef}
      className="note-pane__frame"
      title={`Vista de ${title}`}
      src={renderSrc}
      sandbox="allow-scripts"
      data-testid="note-render-frame"
      onLoad={() => {
        syncWindow();
        onIframeLoad?.();
      }}
    />
  );
}
