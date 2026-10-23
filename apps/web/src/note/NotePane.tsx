import { useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { isGavetaNavigateMessage } from './navigate-message.ts';
import { useNoteLiveState } from '../live/useNoteLiveState.ts';
import { NoteRenderFrame } from './NoteRenderFrame.tsx';

const NO_RENDER_ID_MESSAGE =
  'Esta nota aún no tiene un id en el índice; no se puede previsualizar hasta que se reindexe.';
const NOTE_DELETED_MESSAGE = 'Esta nota fue eliminada del vault.';

export function NotePane() {
  const { ref: encodedRef } = useParams();
  const tabState = useTabs();
  const { tabs, activeTabId } = tabState;
  const iframeWindowRef = useRef<Window | null>(null);

  const activeTab = useMemo(() => {
    if (encodedRef !== undefined) {
      const ref = decodeURIComponent(encodedRef);
      const noteId = isNoteUlid(ref) ? ref : null;
      return (
        tabs.find((tab) => tab.ref === ref) ?? {
          id: ref,
          ref,
          title: ref,
          path: ref,
          noteId,
        }
      );
    }
    const current = tabs.find((tab) => tab.id === activeTabId);
    return current ?? null;
  }, [encodedRef, tabs, activeTabId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframeWindowRef.current) {
        return;
      }
      if (!isGavetaNavigateMessage(event.data)) {
        return;
      }
      const ref = event.data.ref;
      const noteId = isNoteUlid(ref) ? ref : null;
      tabState.openTab(ref, ref, ref, noteId);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [tabState]);

  const noteId = activeTab?.noteId ?? null;
  const { reloadKey, deleted } = useNoteLiveState(noteId);

  if (activeTab === null) {
    return (
      <section className="note-pane note-pane--empty" aria-label="Área de nota">
        <p className="note-pane__placeholder">Elige una nota en el explorador para empezar.</p>
      </section>
    );
  }

  return (
    <section className="note-pane" aria-label="Área de nota">
      <header className="note-pane__header">
        <h1 className="note-pane__title">{activeTab.title}</h1>
        <p className="note-pane__path">{activeTab.path}</p>
      </header>
      {deleted ? (
        <p className="note-pane__placeholder">{NOTE_DELETED_MESSAGE}</p>
      ) : noteId === null ? (
        <p className="note-pane__placeholder">{NO_RENDER_ID_MESSAGE}</p>
      ) : (
        <NoteRenderFrame
          key={`${noteId}-${String(reloadKey)}`}
          noteId={noteId}
          title={activeTab.title}
          onIframeWindow={(window) => {
            iframeWindowRef.current = window;
          }}
        />
      )}
    </section>
  );
}
