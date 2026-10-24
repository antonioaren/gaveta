import { useCallback, useEffect, useId, useState } from 'react';
import { ApiError } from '../api/client.ts';
import { fetchNoteRead } from '../api/read-note.ts';
import { postNoteMeta } from '../api/meta-write.ts';
import { formatTagsInput, parseTagsInput } from '../new-note/parse-tags.ts';

interface NoteMetaPanelProps {
  readonly noteRef: string;
  readonly initialTags: readonly string[];
  readonly initialAliases: readonly string[];
}

const CONFLICT_MESSAGE =
  'La nota ha cambiado desde la última lectura. Recarga la nota e inténtalo de nuevo.';

export function NoteMetaPanel({ noteRef, initialTags, initialAliases }: NoteMetaPanelProps) {
  const tagsId = useId();
  const aliasesId = useId();
  const [tagsInput, setTagsInput] = useState(formatTagsInput(initialTags));
  const [aliasesInput, setAliasesInput] = useState(formatTagsInput(initialAliases));
  const [hash, setHash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchNoteRead(noteRef).then((read) => {
      if (!cancelled) {
        setHash(read.hash);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [noteRef]);

  const save = useCallback(async () => {
    if (hash === null) {
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await postNoteMeta(noteRef, hash, {
        tags: parseTagsInput(tagsInput),
        aliases: parseTagsInput(aliasesInput),
      });
      const read = await fetchNoteRead(noteRef);
      setHash(read.hash);
      setSaved(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'E_CONFLICT') {
        setError(CONFLICT_MESSAGE);
        const read = await fetchNoteRead(noteRef);
        setHash(read.hash);
      } else {
        const message =
          caught instanceof ApiError ? caught.message : 'No se pudieron guardar los metadatos';
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }, [aliasesInput, hash, noteRef, tagsInput]);

  return (
    <section
      className="note-meta-panel"
      aria-label="Etiquetas y alias"
      data-testid="note-meta-panel"
    >
      <h2 className="note-meta-panel__title">Metadatos</h2>
      <label className="field" htmlFor={tagsId}>
        <span className="field__label">Etiquetas</span>
        <input
          id={tagsId}
          className="field__control"
          value={tagsInput}
          onChange={(event) => {
            setTagsInput(event.target.value);
          }}
          data-testid="note-meta-tags"
        />
      </label>
      <label className="field" htmlFor={aliasesId}>
        <span className="field__label">Alias</span>
        <input
          id={aliasesId}
          className="field__control"
          value={aliasesInput}
          onChange={(event) => {
            setAliasesInput(event.target.value);
          }}
          data-testid="note-meta-aliases"
        />
      </label>
      {error !== null ? (
        <p className="note-meta-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? <p className="note-meta-panel__ok">Metadatos guardados.</p> : null}
      <button
        type="button"
        className="note-meta-panel__save"
        disabled={saving || hash === null}
        data-testid="note-meta-save"
        onClick={() => {
          void save();
        }}
      >
        {saving ? 'Guardando…' : 'Guardar metadatos'}
      </button>
    </section>
  );
}
