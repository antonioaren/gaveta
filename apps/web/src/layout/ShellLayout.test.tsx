// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setSessionToken, clearSessionToken } from '../auth/session-token.ts';
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
    vi.fn<typeof fetch>().mockResolvedValue({
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
    } as Response),
  );

  render(
    <MemoryRouter>
      <ShellLayout />
    </MemoryRouter>,
  );

  expect(screen.getByRole('navigation', { name: 'Explorador de notas' })).toBeInTheDocument();
  expect(screen.getByLabelText('Panel de conexiones')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });
});
