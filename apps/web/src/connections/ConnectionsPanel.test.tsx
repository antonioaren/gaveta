// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { TabProvider } from '../tabs/TabContext.tsx';
import { ConnectionsPanel } from './ConnectionsPanel.tsx';

const DESTINO_ID = '01M5HGV8800000000000000002';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('panel-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('renders backlink context as plain text without HTML', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((input) => {
      const path =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (path.includes('/api/links')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: true,
              schemaVersion: 1,
              data: { ref: DESTINO_ID, links: [] },
            }),
        } as Response);
      }
      if (path.includes('/api/backlinks')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: true,
              schemaVersion: 1,
              data: {
                ref: DESTINO_ID,
                backlinks: [
                  {
                    sourcePath: 'formas-de-enlace.html',
                    sourceId: '01M5HGV8800000000000000003',
                    sourceTitle: 'Formas de enlace',
                    rel: 'related',
                    text: 'Destino enlace',
                    section: null,
                    context: 'Atajo a <em>Destino</em> <script>x</script>',
                  },
                ],
              },
            }),
        } as Response);
      }
      if (path.includes('/api/graph')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: true,
              schemaVersion: 1,
              data: {
                ref: DESTINO_ID,
                depth: 1,
                type: null,
                tag: null,
                rel: null,
                nodes: [],
                edges: [],
              },
            }),
        } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch ${path}`));
    }),
  );

  render(
    <MemoryRouter initialEntries={[`/nota/${DESTINO_ID}`]}>
      <TabProvider>
        <Routes>
          <Route path="/nota/:ref" element={<ConnectionsPanel />} />
        </Routes>
      </TabProvider>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByText('Formas de enlace')).toBeInTheDocument();
  });
  expect(screen.getByText('Atajo a Destino')).toBeInTheDocument();
  expect(screen.queryByRole('emphasis')).not.toBeInTheDocument();
});
