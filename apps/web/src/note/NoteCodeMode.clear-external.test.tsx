// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as noteEdit from '../api/note-edit.ts';
import * as noteRead from '../api/note-read.ts';
import { renderWithI18n } from '../i18n/render-with-i18n.tsx';
import { NoteCodeMode } from './NoteCodeMode.tsx';

const clearExternal = vi.fn();

vi.mock('./useExternalNoteRevision.ts', () => ({
  useExternalNoteRevision: () => ({
    external: {
      hash: 'sha256:disk',
      html: '<article><h1>Disk</h1></article>',
    },
    clearExternal,
  }),
}));

vi.mock('../editor/code/CodeNoteEditor.tsx', () => ({
  CodeNoteEditor: ({ onChange }: { readonly onChange: (value: string) => void }) => {
    useEffect(() => {
      onChange('<article><h1>Edited</h1></article>');
    }, [onChange]);
    return <div data-testid="code-editor-stub" />;
  },
}));

vi.mock('../editor/code/validate-diagnostics.ts', () => ({
  validateNoteHtml: vi.fn().mockResolvedValue({ ok: true }),
}));

const baseNote = {
  id: '01NOTE',
  path: 'nota.html',
  title: 'Nota',
  type: 'doc',
  hash: 'sha256:local',
  html: '<article><h1>Local</h1></article>',
};

describe('NoteCodeMode external revision', () => {
  beforeEach(() => {
    clearExternal.mockClear();
    vi.spyOn(noteRead, 'fetchNoteHtml').mockResolvedValue(baseNote);
    vi.spyOn(noteEdit, 'saveNoteDocument').mockResolvedValue({
      hash: 'sha256:local',
      path: 'nota.html',
      title: 'Nota',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('clears external revision after accepting the disk version from merge view', async () => {
    const user = userEvent.setup();
    renderWithI18n(
      <NoteCodeMode
        noteRef="nota"
        noteId="01NOTE"
        path="nota.html"
        onExit={vi.fn()}
        onSaved={vi.fn()}
      />,
      { locale: 'en' },
    );

    await waitFor(() => {
      expect(screen.getByTestId('note-external-change')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('note-external-change-diff'));
    await user.click(screen.getByTestId('note-merge-accept-theirs'));

    expect(clearExternal).toHaveBeenCalledTimes(1);
  });

  it('clears external revision after a successful save with keep mine', async () => {
    const user = userEvent.setup();
    renderWithI18n(
      <NoteCodeMode
        noteRef="nota"
        noteId="01NOTE"
        path="nota.html"
        onExit={vi.fn()}
        onSaved={vi.fn()}
      />,
      { locale: 'en' },
    );

    await waitFor(() => {
      expect(screen.getByTestId('note-external-change')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('note-external-change-diff'));
    await user.click(screen.getByTestId('note-merge-keep-mine'));

    await waitFor(() => {
      expect(noteEdit.saveNoteDocument).toHaveBeenCalled();
      expect(clearExternal).toHaveBeenCalledTimes(1);
    });
  });
});
