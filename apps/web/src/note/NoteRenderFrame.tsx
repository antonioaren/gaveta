import { useEffect, useRef } from 'react';
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
  const renderSrc = useRenderFrameUrl(noteId);

  useEffect(() => {
    if (reloadGeneration === 0) {
      return;
    }
    const iframe = iframeRef.current;
    if (iframe === null) {
      return;
    }
    try {
      iframe.contentWindow?.location.reload();
    } catch {
      iframe.src = renderSrc ?? iframe.src;
    }
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
