import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { NoteListItem } from '../api/types.ts';
import { fetchNoteHtml } from '../api/note-read.ts';
import { VisualNoteEditor } from '../editor/VisualNoteEditor.tsx';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { NoteOpsMenuButtons } from '../note-ops/NoteOpsMenu.tsx';
import type { NoteOpKind, NoteOpTarget } from '../note-ops/note-op-target.ts';
import { noteOpTargetFromListItem } from '../note-ops/note-op-target.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { useNoteLiveState } from '../live/useNoteLiveState.ts';
import { NoteRenderFrame } from './NoteRenderFrame.tsx';
import { NoteCodeMode } from './NoteCodeMode.tsx';
import { useRenderBridgeHost } from './useRenderBridgeHost.ts';

const NO_RENDER_ID_MESSAGE =
  'Esta nota aún no tiene un id en el índice; no se puede previsualizar hasta que se reindexe.';
const NOTE_DELETED_MESSAGE = 'Esta nota fue eliminada del vault.';

interface NotePaneProps {
  readonly notes: readonly NoteListItem[];
  readonly onNoteOp: (kind: NoteOpKind, target: NoteOpTarget) => void;
}

interface EditDraft {
  readonly html: string;
  readonly hash: string;
}

export function NotePane({ notes, onNoteOp }: NotePaneProps) {
  const { ref: encodedRef } = useParams();
  const tabState = useTabs();
  const { tabs, activeTabId } = tabState;
  const iframeWindowRef = useRef<Window | null>(null);
  const [codeModeForRef, setCodeModeForRef] = useState<string | null>(null);
  const [editTargetRef, setEditTargetRef] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

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

  const activeDraft = activeTab !== null && editTargetRef === activeTab.ref ? draft : null;
  const inVisualEdit = activeDraft !== null;
  const inCodeMode = activeTab !== null && codeModeForRef === activeTab.ref;
  const editingAny = inVisualEdit || inCodeMode;

  const noteRef = activeTab?.ref ?? null;
  const { taskError } = useRenderBridgeHost({
    iframeWindowRef,
    noteRef: editingAny ? null : noteRef,
    tabState,
  });

  const noteId = activeTab?.noteId ?? null;
  const { reloadKey, deleted } = useNoteLiveState(noteId, editingAny);

  const startEdit = useCallback(async (): Promise<void> => {
    if (activeTab === null) {
      return;
    }
    setCodeModeForRef(null);
    setLoadingEdit(true);
    setEditError(null);
    try {
      const note = await fetchNoteHtml(activeTab.ref);
      setDraft({ html: note.html, hash: note.hash });
      setEditTargetRef(activeTab.ref);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo abrir el editor';
      setEditError(message);
    } finally {
      setLoadingEdit(false);
    }
  }, [activeTab]);

  const cancelEdit = useCallback(() => {
    setEditTargetRef(null);
    setDraft(null);
    setEditError(null);
  }, []);

  const enterCodeMode = useCallback(() => {
    if (activeTab === null) {
      return;
    }
    setEditTargetRef(null);
    setDraft(null);
    setEditError(null);
    setCodeModeForRef(activeTab.ref);
  }, [activeTab]);

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

  if (activeTab === null) {
    return (
      <section className="note-pane note-pane--empty" aria-label="Área de nota">
        <p className="note-pane__placeholder">Elige una nota en el explorador para empezar.</p>
      </section>
    );
  }

  const canEdit = !deleted && noteId !== null;
  const showModeButtons = canEdit && !editingAny;

  return (
    <section className="note-pane" aria-label="Área de nota">
      <header className="note-pane__header">
        <div className="note-pane__header-main">
          <h1 className="note-pane__title">{activeTab.title}</h1>
          <p className="note-pane__path">{activeTab.path}</p>
          {taskError !== null && !editingAny ? (
            <p className="note-pane__error" role="alert">{taskError}</p>
          ) : null}
        </div>
        <div className="note-pane__actions">
          {showModeButtons ? (
            <button
              type="button"
              className="note-pane__edit-button"
              data-testid="note-edit-button"
              disabled={loadingEdit}
              onClick={() => {
                void startEdit();
              }}
            >
              {loadingEdit ? 'Abriendo…' : 'Editar'}
            </button>
          ) : null}
          {showModeButtons ? (
            <button
              type="button"
              className="note-pane__mode-button"
              data-testid="enter-code-mode"
              onClick={enterCodeMode}
            >
              Modo código
            </button>
          ) : null}
          {opTarget !== null ? <NoteOpsMenuButtons target={opTarget} onOpen={onNoteOp} /> : null}
        </div>
      </header>
      {editError !== null ? (
        <p className="note-pane__edit-error" role="alert">
          {editError}
        </p>
      ) : null}
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
      ) : activeDraft !== null ? (
        <VisualNoteEditor
          noteRef={activeTab.ref}
          notePath={activeTab.path}
          initialHtml={activeDraft.html}
          ifMatch={activeDraft.hash}
          onCancel={cancelEdit}
          onSaved={() => {
            setEditTargetRef(null);
            setDraft(null);
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
