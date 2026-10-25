// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { renderWithI18n } from '../i18n/render-with-i18n.tsx';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TabProvider } from '../tabs/TabContext.tsx';
import { NoteOpsDialog } from './NoteOpsDialog.tsx';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDialog() {
  return renderWithI18n(
    <MemoryRouter>
      <TabProvider>
        <NoteOpsDialog
          kind="delete"
          target={{
            ref: '01NOTE',
            path: 'nota-x.html',
            title: 'Nota X',
            noteId: '01NOTE',
          }}
          notes={[]}
          onClose={() => undefined}
          onConflictRefresh={() => undefined}
        />
      </TabProvider>
    </MemoryRouter>,
    { locale: 'es' },
  );
}

it('lists backlinks in Spanish before delete', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo) => {
      const path = typeof input === 'string' ? input : input.url;
      if (path.includes('/api/read')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              schemaVersion: 1,
              data: { hash: 'sha256:abc', title: 'Nota X', path: 'nota-x.html' },
            }),
        } as Response);
      }
      if (path.includes('/api/backlinks')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              schemaVersion: 1,
              data: {
                ref: '01NOTE',
                backlinks: [
                  {
                    sourcePath: 'a.html',
                    sourceId: '02',
                    sourceTitle: 'Origen',
                    rel: null,
                    text: 'enlace',
                    section: null,
                    context: '…contexto…',
                  },
                ],
              },
            }),
        } as Response);
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    }),
  );

  renderDialog();
  await waitFor(() => {
    expect(screen.getByText(/Enlaces entrantes \(1\)/u)).toBeInTheDocument();
  });
  expect(screen.getByText(/No se puede borrar mientras/u)).toBeInTheDocument();
  await userEvent.click(screen.getByTestId('note-delete-force'));
  expect(screen.getByText('Borrar definitivamente')).toBeInTheDocument();
});
