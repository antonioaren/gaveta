import { apiFetch, ApiError } from './client.ts';
import type { ApiEnvelope } from './types.ts';

const IF_MATCH_HEADER = 'if-match';

export interface MoveNoteResult {
  readonly id: string | null;
  readonly from: string;
  readonly to: string;
  readonly rewritten: readonly string[];
}

export interface RemoveNoteResult {
  readonly id: string | null;
  readonly path: string;
  readonly title: string;
  readonly forced: boolean;
  readonly pending: readonly string[];
}

async function parseWriteEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const body = (await response.json()) as ApiEnvelope<T> & {
    code?: string;
    message?: string;
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  };
  if (!response.ok || !body.ok) {
    const nested = body.error;
    const code = body.code ?? nested?.code ?? 'E_INTERNAL';
    const message = body.message ?? nested?.message ?? 'Error de la API';
    throw new ApiError(response.status, code, message, nested?.details);
  }
  return body;
}

export async function postMoveNote(
  ref: string,
  destination: string,
  ifMatch: string,
): Promise<MoveNoteResult> {
  const response = await apiFetch('/api/mv', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IF_MATCH_HEADER]: ifMatch,
    },
    body: JSON.stringify({ ref, destination }),
  });
  const envelope = await parseWriteEnvelope<MoveNoteResult>(response);
  return envelope.data;
}

export async function postRemoveNote(
  ref: string,
  ifMatch: string,
  force: boolean,
): Promise<RemoveNoteResult> {
  const response = await apiFetch('/api/rm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IF_MATCH_HEADER]: ifMatch,
    },
    body: JSON.stringify({ ref, force }),
  });
  const envelope = await parseWriteEnvelope<RemoveNoteResult>(response);
  return envelope.data;
}
