import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { NoteListItem } from '../api/types.ts';
import { fetchNoteHtml } from '../api/note-read.ts';
import { VisualNoteEditor } from '../editor/VisualNoteEditor.tsx';
import { isGhostViewerRef } from '../new-note/ghost-viewer-ref.ts';
import { useNewNoteDialog } from '../new-note/useNewNoteDialog.ts';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { NoteOpsMenuButtons, NoteToolbarPrimary } from '../note-ops/NoteOpsMenu.tsx';
import type { NoteOpKind, NoteOpTarget } from '../note-ops/note-op-target.ts';
import { noteOpTargetFromListItem } from '../note-ops/note-op-target.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { useNoteLiveState } from '../live/useNoteLiveState.ts';
import { NoteRenderFrame } from './NoteRenderFrame.tsx';
import { NoteCodeMode } from './NoteCodeMode.tsx';
import { NoteMetaPanel } from './NoteMetaPanel.tsx';
import { useI18n } from '../i18n/useI18n.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import { useRenderBridgeHost } from './useRenderBridgeHost.ts';

interface NotePaneProps {
  readonly notes: readonly NoteListItem[];
  readonly onNoteOp: (kind: NoteOpKind, target: NoteOpTarget) => void;
  readonly onExportNote: (ref: string, label: string) => void;
}

interface EditDraft {
  readonly html: string;
  readonly hash: string;
}

export function NotePane({ notes, onNoteOp, onExportNote }: NotePaneProps) {
  const { t } = useI18n();
  const { ref: encodedRef } = useParams();
  const tabState = useTabs();
  const { openNewNote } = useNewNoteDialog();
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
  const ghostRef =
    activeTab !== null && isGhostViewerRef(activeTab.ref, notes) ? activeTab.ref : null;
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
      const message = messageFromCaught(error, 'web.api.error.fallbackOpenEditor');
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

  const listItem = useMemo(() => {
    if (activeTab === null) {
      return null;
    }
    return (
      notes.find((note) => note.path === activeTab.path || note.id === activeTab.noteId) ?? null
    );
  }, [activeTab, notes]);

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
      <section className="note-pane note-pane--empty" aria-label={t('web.note.aria')}>
        <p className="note-pane__placeholder">{t('web.note.pickFromExplorer')}</p>
      </section>
    );
  }

  const canEdit = !deleted && noteId !== null;
  const showModeButtons = canEdit && !editingAny;

  return (
    <section className="note-pane" aria-label={t('web.note.aria')}>
      <header className="note-toolbar">
        <div className="note-toolbar__leading">
          <h1 className="note-toolbar__title">{activeTab.title}</h1>
          <p className="note-toolbar__path">{activeTab.path}</p>
          {taskError !== null && !editingAny ? (
            <p className="note-pane__error" role="alert">
              {taskError}
            </p>
          ) : null}
        </div>
        <div className="note-toolbar__actions">
          {showModeButtons ? (
            <NoteToolbarPrimary
              loadingEdit={loadingEdit}
              onEdit={() => {
                void startEdit();
              }}
              onCodeMode={enterCodeMode}
            />
          ) : null}
          {showModeButtons && opTarget !== null ? (
            <NoteOpsMenuButtons
              target={opTarget}
              onOpen={onNoteOp}
              onExport={() => {
                onExportNote(opTarget.ref, opTarget.title);
              }}
            />
          ) : null}
        </div>
      </header>
      {editError !== null ? (
        <p className="note-pane__edit-error" role="alert">
          {editError}
        </p>
      ) : null}
      {deleted ? (
        <p className="note-pane__placeholder">{t('web.note.deleted')}</p>
      ) : noteId === null ? (
        <div className="note-pane__missing">
          <p className="note-pane__placeholder">
            {ghostRef !== null ? t('web.note.ghost') : t('web.note.notIndexedPreview')}
          </p>
          {ghostRef !== null ? (
            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--md"
              onClick={() => {
                openNewNote({ title: ghostRef, replaceTabRef: ghostRef });
              }}
            >
              {t('web.common.createNote')}
            </button>
          ) : null}
        </div>
      ) : inCodeMode ? (
        <NoteCodeMode
          key={activeTab.ref}
          noteRef={activeTab.ref}
          noteId={noteId}
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
          noteId={noteId}
          notePath={activeTab.path}
          initialHtml={activeDraft.html}
          ifMatch={activeDraft.hash}
          onCancel={cancelEdit}
          onSaved={() => {
            setEditTargetRef(null);
            setDraft(null);
          }}
          onReload={(html, hash) => {
            setDraft({ html, hash });
          }}
        />
      ) : (
        <>
          <div className="note-pane__stage">
            {listItem !== null ? (
              <NoteMetaPanel
                key={activeTab.ref}
                noteRef={activeTab.ref}
                initialTags={listItem.tags}
                initialAliases={listItem.aliases}
              />
            ) : null}
            <NoteRenderFrame
              noteId={noteId}
              title={activeTab.title}
              reloadGeneration={reloadKey}
              onIframeWindow={(window) => {
                iframeWindowRef.current = window;
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
