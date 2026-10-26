import { useCallback, useState, type ReactElement } from 'react';
import { fetchNoteVsCodeUri } from '../api/note-vscode-uri.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import { useI18n } from '../i18n/useI18n.ts';

export interface OpenInVsCodeButtonProps {
  readonly noteRef: string;
}

export function OpenInVsCodeButton({ noteRef }: OpenInVsCodeButtonProps): ReactElement {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openInVsCode = useCallback(() => {
    setBusy(true);
    setError(null);
    void fetchNoteVsCodeUri(noteRef)
      .then(({ uri }) => {
        if (!uri.startsWith('vscode://file/')) {
          throw new Error('invalid vscode uri');
        }
        window.location.assign(uri);
      })
      .catch((caught: unknown) => {
        setError(messageFromCaught(caught, 'web.note.code.openInVsCodeFailed'));
      })
      .finally(() => {
        setBusy(false);
      });
  }, [noteRef]);

  return (
    <span className="note-code-mode__external-editor">
      <button
        type="button"
        className="note-code-mode__button"
        data-testid="open-in-vscode"
        disabled={busy}
        onClick={openInVsCode}
      >
        {busy ? t('web.common.opening') : t('web.note.code.openInVsCode')}
      </button>
      {error !== null ? (
        <span className="note-code-mode__external-editor-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
