// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setSessionToken, clearSessionToken } from '../auth/session-token.ts';

vi.mock('../note/NotePane.tsx', () => ({
  NotePane: () => <div aria-label="Área de nota" />,
}));

import { ShellLayout } from './ShellLayout.tsx';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('REQ-APP-01: renders the three-column shell in Spanish', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((input) => {
      const path =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (path.includes('/api/doctor')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: true,
              schemaVersion: 1,
              data: { ok: true, findings: [] },
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            schemaVersion: 1,
            data: {
              notes: [
                {
                  id: '01NOTE',
                  path: 'demo.html',
                  title: 'Demo',
                  type: 'doc',
                  tags: ['alpha'],
                  aliases: [],
                },
              ],
            },
          }),
      } as Response);
    }),
  );

  render(
    <MemoryRouter>
      <ShellLayout />
    </MemoryRouter>,
  );

  expect(screen.getByRole('navigation', { name: 'Explorador de notas' })).toBeInTheDocument();
  expect(screen.getByLabelText('Panel de conexiones')).toBeInTheDocument();
  expect(screen.getByLabelText('Panel de salud')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });
});
