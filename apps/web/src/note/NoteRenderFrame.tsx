import { useEffect, useRef } from 'react';
import { attachLiveReloadFollowUp } from './live-iframe-reload.ts';
import { appendRenderReloadQuery } from './render-frame.ts';
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
    if (renderSrc === null) {
      return;
    }
    const iframe = iframeRef.current;
    if (iframe === null) {
      return;
    }
    return attachLiveReloadFollowUp(iframe, renderSrc, () => latestReloadGenerationRef.current);
  }, [renderSrc]);

  const frameSrc =
    renderSrc === null
      ? null
      : reloadGeneration > 0
        ? appendRenderReloadQuery(renderSrc, reloadGeneration)
        : renderSrc;

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
      src={frameSrc ?? renderSrc}
      sandbox="allow-scripts"
      data-testid="note-render-frame"
      onLoad={() => {
        syncWindow();
        onIframeLoad?.();
      }}
    />
  );
}
