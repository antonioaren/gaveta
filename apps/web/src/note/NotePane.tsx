import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { NoteListItem } from '../api/types.ts';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { NoteOpsMenuButtons } from '../note-ops/NoteOpsMenu.tsx';
import type { NoteOpKind, NoteOpTarget } from '../note-ops/note-op-target.ts';
import { noteOpTargetFromListItem } from '../note-ops/note-op-target.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { isGavetaNavigateMessage } from './navigate-message.ts';
import { useNoteLiveState } from '../live/useNoteLiveState.ts';
import { NoteRenderFrame } from './NoteRenderFrame.tsx';
import { NoteCodeMode } from './NoteCodeMode.tsx';

const NO_RENDER_ID_MESSAGE =
  'Esta nota aún no tiene un id en el índice; no se puede previsualizar hasta que se reindexe.';
const NOTE_DELETED_MESSAGE = 'Esta nota fue eliminada del vault.';

interface NotePaneProps {
  readonly notes: readonly NoteListItem[];
  readonly onNoteOp: (kind: NoteOpKind, target: NoteOpTarget) => void;
}

export function NotePane({ notes, onNoteOp }: NotePaneProps) {
  const { ref: encodedRef } = useParams();
  const tabState = useTabs();
  const { tabs, activeTabId } = tabState;
  const iframeWindowRef = useRef<Window | null>(null);
  const [codeModeForRef, setCodeModeForRef] = useState<string | null>(null);

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

  const opTarget = useMemo((): NoteOpTarget | null => {
    if (activeTab === null) {
      return null;
    }
    const fromList = notes.find(
      (note) => note.path === activeTab.path || note.id === activeTab.noteId,
    );
    if (fromList !== undefined) {
      return noteOpTargetFromListItem(fromList);
    }
    return {
      ref: activeTab.ref,
      path: activeTab.path,
      title: activeTab.title,
      noteId: activeTab.noteId,
    };
  }, [activeTab, notes]);

  const inCodeMode = activeTab !== null && codeModeForRef === activeTab.ref;

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
        <div className="note-pane__header-main">
          <h1 className="note-pane__title">{activeTab.title}</h1>
          <p className="note-pane__path">{activeTab.path}</p>
        </div>
        <div className="note-pane__actions">
          {noteId !== null && !deleted && !inCodeMode ? (
            <button
              type="button"
              className="note-pane__mode-button"
              data-testid="enter-code-mode"
              onClick={() => {
                setCodeModeForRef(activeTab.ref);
              }}
            >
              Modo código
            </button>
          ) : null}
          {opTarget !== null ? (
            <NoteOpsMenuButtons target={opTarget} onOpen={onNoteOp} />
          ) : null}
        </div>
      </header>
      {deleted ? (
        <p className="note-pane__placeholder">{NOTE_DELETED_MESSAGE}</p>
      ) : noteId === null ? (
        <p className="note-pane__placeholder">{NO_RENDER_ID_MESSAGE}</p>
      ) : inCodeMode ? (
        <NoteCodeMode
          key={activeTab.ref}
          noteRef={activeTab.ref}
          path={activeTab.path}
          onExit={() => {
            setCodeModeForRef(null);
          }}
          onSaved={() => {
            /* live reload picks up disk changes */
          }}
        />
      ) : (
        <NoteRenderFrame
          noteId={noteId}
          title={activeTab.title}
          reloadGeneration={reloadKey}
          onIframeWindow={(window) => {
            iframeWindowRef.current = window;
          }}
        />
      )}
    </section>
  );
}
