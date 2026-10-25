import { useCallback, useEffect, useId, useState } from 'react';
import { ApiError } from '../api/client.ts';
import { fetchNoteRead } from '../api/read-note.ts';
import { postNoteMeta } from '../api/meta-write.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import { formatTagsInput, parseTagsInput } from '../new-note/parse-tags.ts';

interface NoteMetaPanelProps {
  readonly noteRef: string;
  readonly initialTags: readonly string[];
  readonly initialAliases: readonly string[];
}

export function NoteMetaPanel({ noteRef, initialTags, initialAliases }: NoteMetaPanelProps) {
  const { t } = useI18n();
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
        setError(t('web.api.error.E_CONFLICT_META'));
        const read = await fetchNoteRead(noteRef);
        setHash(read.hash);
      } else {
        const message =
          caught instanceof ApiError
            ? caught.message
            : messageFromCaught(caught, 'web.api.error.fallbackMetaSave');
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }, [aliasesInput, hash, noteRef, tagsInput, t]);

  return (
    <section
      className="note-meta-panel"
      aria-label={t('web.noteMeta.aria')}
      data-testid="note-meta-panel"
    >
      <h2 className="note-meta-panel__title">{t('web.noteMeta.title')}</h2>
      <label className="field" htmlFor={tagsId}>
        <span className="field__label">{t('web.noteMeta.tags')}</span>
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
        <span className="field__label">{t('web.noteMeta.aliases')}</span>
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
      {saved ? (
        <p className="note-meta-panel__ok" data-testid="note-meta-saved">
          {t('web.noteMeta.saved')}
        </p>
      ) : null}
      <button
        type="button"
        className="note-meta-panel__save"
        disabled={saving || hash === null}
        data-testid="note-meta-save"
        onClick={() => {
          void save();
        }}
      >
        {saving ? t('web.common.saving') : t('web.noteMeta.save')}
      </button>
    </section>
  );
}
