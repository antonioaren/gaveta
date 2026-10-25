// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { useConnectionsData } from './useConnectionsData.ts';

const REF_A = '01M5HGV8800000000000000002';
const REF_B = '01M5HGV8800000000000000003';

const releasePendingA: (() => void)[] = [];

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

function bodyForPath(path: string): unknown {
  if (path.includes('/api/links')) {
    const ref = path.includes(REF_A) ? REF_A : REF_B;
    return { ok: true, schemaVersion: 1, data: { ref, links: [] } };
  }
  if (path.includes('/api/backlinks')) {
    const ref = path.includes(REF_A) ? REF_A : REF_B;
    return { ok: true, schemaVersion: 1, data: { ref, backlinks: [] } };
  }
  if (path.includes('/api/mentions')) {
    const ref = path.includes(REF_A) ? REF_A : REF_B;
    return { ok: true, schemaVersion: 1, data: { ref, mentions: [] } };
  }
  const ref = path.includes(REF_A) ? REF_A : REF_B;
  return {
    ok: true,
    schemaVersion: 1,
    data: {
      ref,
      depth: 1,
      type: null,
      tag: null,
      rel: null,
      folder: null,
      nodes: [],
      edges: [],
    },
  };
}

beforeEach(() => {
  clearSessionToken();
  setSessionToken('test');
  releasePendingA.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const isA = path.includes(REF_A);
      if (isA) {
        return new Promise<Response>((resolve) => {
          releasePendingA.push(() => {
            resolve(jsonResponse(bodyForPath(path)));
          });
        });
      }
      return Promise.resolve(jsonResponse(bodyForPath(path)));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('does not apply a stale connections response after the ref changes', async () => {
  const { result, rerender } = renderHook(({ ref }) => useConnectionsData(ref), {
    initialProps: { ref: REF_A },
  });

  rerender({ ref: REF_B });
  await waitFor(() => {
    expect(result.current.links?.ref).toBe(REF_B);
  });

  for (const release of releasePendingA.splice(0)) {
    release();
  }

  await waitFor(() => {
    expect(result.current.links?.ref).toBe(REF_B);
  });
});
