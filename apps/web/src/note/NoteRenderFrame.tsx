import { useRef } from 'react';
import { useRenderFrameUrl } from './useRenderFrameUrl.ts';

interface NoteRenderFrameProps {
  readonly noteId: string;
  readonly title: string;
  readonly onIframeWindow: (window: Window | null) => void;
}

export function NoteRenderFrame({ noteId, title, onIframeWindow }: NoteRenderFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const renderSrc = useRenderFrameUrl(noteId);

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
      onLoad={syncWindow}
    />
  );
}
