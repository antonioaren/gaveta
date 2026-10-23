// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { TabProvider } from '../tabs/TabContext.tsx';
import { SearchPalette } from './SearchPalette.tsx';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('palette-token');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearSessionToken();
});

function renderPalette(onClose: () => void = () => undefined) {
  return render(
    <MemoryRouter>
      <TabProvider>
        <SearchPalette open notes={[]} onClose={onClose} />
      </TabProvider>
    </MemoryRouter>,
  );
}

it('shows navigation commands and search hits with highlighted snippet text', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!path.includes('/api/search')) {
        return Promise.reject(new Error(`unexpected ${path}`));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            schemaVersion: 1,
            data: {
              query: 'dest',
              type: null,
              tag: null,
              limit: 20,
              hits: [
                {
                  path: 'destino-enlace.html',
                  id: '01M5HGV8800000000000000002',
                  title: 'Destino enlace',
                  type: 'doc',
                  tags: [],
                  snippet: 'Texto <mark>destino</mark>',
                },
              ],
            },
          }),
      } as Response);
    }),
  );

  const user = userEvent.setup();
  renderPalette();
  const input = screen.getByRole('combobox');
  await user.type(input, 'dest');
  await waitFor(
    () => {
      expect(screen.getByText('Destino enlace')).toBeInTheDocument();
    },
    { timeout: 3000 },
  );
  expect(screen.getByText('destino')).toBeInTheDocument();
});

it('closes on Escape from the combobox', () => {
  const onClose = vi.fn();
  renderPalette(onClose);
  const input = screen.getByRole('combobox');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
