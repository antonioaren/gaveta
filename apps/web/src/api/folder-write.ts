import { ABSENT_NOTE_HASH } from '../new-note/absent-note-hash.ts';
import { apiFetch, ApiError } from './client.ts';
import type { ApiEnvelope } from './types.ts';

const IF_MATCH_HEADER = 'if-match';

export interface MoveFolderResult {
  readonly from: string;
  readonly to: string;
  readonly moved: readonly {
    readonly from: string;
    readonly to: string;
    readonly id: string | null;
  }[];
  readonly rewritten: readonly string[];
}

export interface RemoveFolderResult {
  readonly folder: string;
  readonly removed: readonly string[];
  readonly forced: boolean;
  readonly pending: readonly string[];
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T> & {
    code?: string;
    message?: string;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !body.ok) {
    const nested = body.error;
    throw new ApiError(
      response.status,
      body.code ?? nested?.code ?? 'E_INTERNAL',
      body.message ?? nested?.message ?? 'Error de la API',
    );
  }
  return body.data;
}

export async function postMkdirFolder(folder: string): Promise<{ folder: string }> {
  const response = await apiFetch('/api/folder/mkdir', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IF_MATCH_HEADER]: ABSENT_NOTE_HASH,
    },
    body: JSON.stringify({ folder, ifMatch: ABSENT_NOTE_HASH }),
  });
  return parseEnvelope(response);
}

export async function postMoveFolder(
  folder: string,
  destination: string,
): Promise<MoveFolderResult> {
  const response = await apiFetch('/api/folder/mv', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IF_MATCH_HEADER]: ABSENT_NOTE_HASH,
    },
    body: JSON.stringify({ folder, destination, ifMatch: ABSENT_NOTE_HASH }),
  });
  return parseEnvelope(response);
}

export async function postRemoveFolder(
  folder: string,
  force: boolean,
): Promise<RemoveFolderResult> {
  const response = await apiFetch('/api/folder/rm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [IF_MATCH_HEADER]: ABSENT_NOTE_HASH,
    },
    body: JSON.stringify({ folder, force, ifMatch: ABSENT_NOTE_HASH }),
  });
  return parseEnvelope(response);
}
