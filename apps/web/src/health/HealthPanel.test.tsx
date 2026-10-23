// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { TabProvider } from '../tabs/TabContext.tsx';
import { TabBar } from '../tabs/TabBar.tsx';
import { HealthPanel } from './HealthPanel.tsx';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('health-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('groups doctor findings by severity and opens a note by ULID', async () => {
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
              data: {
                ok: false,
                findings: [
                  {
                    code: 'E_LINK_BROKEN',
                    message: 'Enlace roto a <em>destino</em>',
                    hint: 'hint',
                    path: 'origen.html',
                    details: null,
                    severity: 'error',
                    noteId: '01M5HGV8800000000000000002',
                  },
                  {
                    code: 'W_LINK_PENDING',
                    message: 'Pendiente',
                    hint: 'hint',
                    path: 'otra.html',
                    details: null,
                    severity: 'warning',
                    noteId: '01M5HGV8800000000000000003',
                  },
                ],
                fixed: [],
              },
            }),
        } as Response);
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    }),
  );

  render(
    <MemoryRouter>
      <TabProvider>
        <TabBar />
        <HealthPanel />
      </TabProvider>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByText('Errores')).toBeInTheDocument();
  });
  expect(screen.getByText('Advertencias')).toBeInTheDocument();
  expect(screen.getByText('Enlace roto a destino')).toBeInTheDocument();
  expect(screen.queryByRole('emphasis')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /origen\.html/ }));
  expect(screen.getByRole('tab', { name: 'origen.html' })).toBeInTheDocument();
});
