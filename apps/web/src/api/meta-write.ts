import { apiFetch, ApiError } from './client.ts';
import type { ApiEnvelope } from './types.ts';

const IF_MATCH_HEADER = 'if-match';

export interface MetaEditResult {
  readonly id: string;
  readonly path: string;
  readonly hash: string;
  readonly title: string;
  readonly type: string;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T> & {
    code?: string;
    message?: string;
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  };
  if (!response.ok || !body.ok) {
    const nested = body.error;
    throw new ApiError(
      response.status,
      body.code ?? nested?.code ?? 'E_INTERNAL',
      body.message ?? nested?.message ?? 'Error de la API',
      nested?.details,
    );
  }
  return body.data;
}

export async function postNoteMeta(
  ref: string,
  ifMatch: string,
  fields: { readonly tags?: readonly string[]; readonly aliases?: readonly string[] },
): Promise<MetaEditResult> {
  const response = await apiFetch('/api/meta', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IF_MATCH_HEADER]: ifMatch,
    },
    body: JSON.stringify({ ref, ifMatch, ...fields }),
  });
  return parseEnvelope(response);
}
