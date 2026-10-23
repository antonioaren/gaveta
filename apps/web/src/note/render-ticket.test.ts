// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { buildRenderFrameUrl, fetchRenderTicket } from './render-ticket.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('fetches a render ticket and builds the iframe URL', async () => {
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
            id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
            ticket: 'signed-ticket',
            expiresAt: '2026-10-23T12:00:00.000Z',
          },
        }),
    } as Response),
  );

  const ticket = await fetchRenderTicket('01ARZ3NDEKTSV4RRFFQ69G5FAV');
  expect(ticket.ticket).toBe('signed-ticket');
  expect(buildRenderFrameUrl(ticket)).toBe('/render/01ARZ3NDEKTSV4RRFFQ69G5FAV?t=signed-ticket');
});
