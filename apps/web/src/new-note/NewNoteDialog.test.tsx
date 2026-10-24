// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NoteListItem } from '../api/types.ts';
import { TabProvider } from '../tabs/TabContext.tsx';
import { NewNoteDialog } from './NewNoteDialog.tsx';
import { NewNoteDialogProvider } from './NewNoteDialogProvider.tsx';
import { useNewNoteDialog } from './useNewNoteDialog.ts';

const NOTES: NoteListItem[] = [
  {
    id: '01NOTEAAAAAAAAAAAAAAAAAA',
    path: 'nota-x.html',
    title: 'Nota X',
    type: 'doc',
    tags: [],
    aliases: [],
  },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ok: true,
          schemaVersion: 1,
          data: {
            id: '01NEWNOTEAAAAAAAAAAAAA',
            path: 'mi-titulo.html',
            hash: 'sha256:abc',
            title: 'Mi título',
            type: 'doc',
          },
        }),
    } as Response),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('is closed until openNewNote is called', async () => {
  function Opener() {
    const { openNewNote } = useNewNoteDialog();
    return (
      <button
        type="button"
        onClick={() => {
          openNewNote({ title: 'Fantasma' });
        }}
      >
        Abrir
      </button>
    );
  }
  render(
    <MemoryRouter>
      <TabProvider>
        <NewNoteDialogProvider>
          <Opener />
          <NewNoteDialog notes={NOTES} />
        </NewNoteDialogProvider>
      </TabProvider>
    </MemoryRouter>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('Título')).toHaveValue('Fantasma');
  expect(screen.getByText(/fantasma\.html/)).toBeInTheDocument();
});

it('submits create and shows Spanish validation for empty title', async () => {
  function Opener() {
    const { openNewNote } = useNewNoteDialog();
    return (
      <button
        type="button"
        onClick={() => {
          openNewNote();
        }}
      >
        Abrir
      </button>
    );
  }
  render(
    <MemoryRouter>
      <TabProvider>
        <NewNoteDialogProvider>
          <Opener />
          <NewNoteDialog notes={NOTES} />
        </NewNoteDialogProvider>
      </TabProvider>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  const dialog = screen.getByRole('dialog', { name: 'Nueva nota' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Crear nota' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Escribe un título');
  await userEvent.type(within(dialog).getByLabelText('Título'), 'Mi título');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Crear nota' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
