// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import * as metaWrite from '../api/meta-write.ts';
import * as readNote from '../api/read-note.ts';
import { NoteMetaPanel } from './NoteMetaPanel.tsx';

afterEach(() => {
  vi.restoreAllMocks();
});

it('keeps the saved indicator when live index metadata updates after save', async () => {
  const readSpy = vi.spyOn(readNote, 'fetchNoteRead');
  readSpy.mockResolvedValue({ hash: 'hash-1', title: 'Nota', path: 'nota.html' });

  const postSpy = vi.spyOn(metaWrite, 'postNoteMeta');
  postSpy.mockResolvedValue({
    id: '01NOTE',
    path: 'nota.html',
    hash: 'hash-2',
    title: 'Nota',
    type: 'note',
  });

  const user = userEvent.setup();
  const { rerender } = render(
    <NoteMetaPanel noteRef="nota" initialTags={[]} initialAliases={[]} />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('note-meta-save')).toBeEnabled();
  });

  await user.type(screen.getByTestId('note-meta-tags'), 'e2e');
  await user.click(screen.getByTestId('note-meta-save'));

  await waitFor(() => {
    expect(screen.getByTestId('note-meta-saved')).toBeVisible();
  });

  rerender(<NoteMetaPanel noteRef="nota" initialTags={['e2e']} initialAliases={[]} />);

  expect(screen.getByTestId('note-meta-saved')).toBeVisible();
});
