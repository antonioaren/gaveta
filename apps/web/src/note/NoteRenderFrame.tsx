import { useEffect, useRef } from 'react';
import { pushLiveE2eLog } from '../live/live-e2e-log.ts';
import { appendRenderReloadQuery } from './render-frame.ts';
import { useRenderFrameUrl } from './useRenderFrameUrl.ts';
import { useI18n } from '../i18n/useI18n.ts';

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
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const renderSrc = useRenderFrameUrl(noteId);

  const frameSrc =
    renderSrc === null
      ? null
      : reloadGeneration > 0
        ? appendRenderReloadQuery(renderSrc, reloadGeneration)
        : renderSrc;

  const frameKey = frameSrc === null ? noteId : `${noteId}:${String(reloadGeneration)}:${frameSrc}`;

  const syncWindow = (): void => {
    onIframeWindow(iframeRef.current?.contentWindow ?? null);
  };

  useEffect(() => {
    if (frameSrc === null) {
      return;
    }
    pushLiveE2eLog({
      kind: 'iframeNav',
      noteId,
      reloadGeneration,
      frameSrc,
    });
  }, [frameSrc, noteId, reloadGeneration]);

  return renderSrc === null ? (
    <p className="note-pane__placeholder">{t('web.note.preparingView')}</p>
  ) : (
    <iframe
      key={frameKey}
      ref={iframeRef}
      className="note-pane__frame"
      title={t('web.note.renderFrameTitle', { title })}
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
