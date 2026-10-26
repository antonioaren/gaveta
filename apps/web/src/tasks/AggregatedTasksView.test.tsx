// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../i18n/render-with-i18n.tsx';
import { TabProvider } from '../tabs/TabContext.tsx';
import { setSessionToken, clearSessionToken } from '../auth/session-token.ts';
import { AggregatedTasksView } from './AggregatedTasksView.tsx';

vi.mock('../connections/connections-refresh.ts', () => ({
  subscribeVaultNoteLiveRefresh: () => {
    return () => {
      /* no live socket in unit tests */
    };
  },
}));

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

beforeEach(() => {
  navigateMock.mockReset();
  clearSessionToken();
  setSessionToken('test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('REQ-APP-15: lists tasks and opens the source note', async () => {
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (path.includes('/api/tasks')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            schemaVersion: 1,
            data: {
              tasks: [
                {
                  path: 'enlaces/mas/enlace-20.html',
                  noteId: '01NOTE',
                  noteTitle: 'Enlace 20',
                  noteType: 'doc',
                  taskId: 'revisar',
                  text: 'Revisar',
                  checked: false,
                  due: '2026-10-22',
                  priority: 'medium',
                  sectionId: null,
                },
              ],
            },
          }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, schemaVersion: 1, data: {} }),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);

  renderWithI18n(
    <MemoryRouter>
      <TabProvider>
        <AggregatedTasksView />
      </TabProvider>
    </MemoryRouter>,
    { locale: 'en' },
  );

  expect(await screen.findByText(/Revisar/)).toBeTruthy();

  await userEvent.click(screen.getByRole('button', { name: 'Open note Enlace 20' }));
  expect(navigateMock).toHaveBeenCalledWith('/nota/01NOTE');
});
