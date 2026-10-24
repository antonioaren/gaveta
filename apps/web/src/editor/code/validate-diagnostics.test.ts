import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { validateNoteHtml } from './validate-diagnostics.ts';
import { clearSessionToken, setSessionToken } from '../../auth/session-token.ts';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('maps API validation responses', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        ok: true,
        data: {
          ok: false,
          errorCount: 1,
          diagnostics: [
            {
              code: 'E_UNSAFE_SCRIPT',
              severity: 'error',
              message: 'Script no permitido.',
              hint: 'Quita el script.',
              location: { line: 2, column: 5 },
            },
          ],
        },
      }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);

  const result = await validateNoteHtml('<script></script>', 'nota.html');
  expect(result.ok).toBe(false);
  expect(result.diagnostics[0]?.code).toBe('E_UNSAFE_SCRIPT');
});
