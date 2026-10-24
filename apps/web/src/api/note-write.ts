import { apiFetch } from './client.ts';
import type { ApiEnvelope } from './types.ts';

export interface NoteReadHtml {
  readonly id: string | null;
  readonly path: string;
  readonly title: string;
  readonly hash: string;
  readonly html: string;
}

export type SaveNoteResult =
  | { readonly ok: true; readonly hash: string }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly message: string;
      readonly hash?: string;
    };

export async function fetchNoteHtml(ref: string): Promise<NoteReadHtml> {
  const response = await apiFetch(`/api/read?ref=${encodeURIComponent(ref)}&as=html`);
  const body = (await response.json()) as ApiEnvelope<NoteReadHtml> & {
    code?: string;
    message?: string;
  };
  if (!response.ok || !body.ok) {
    const code = body.code ?? 'E_INTERNAL';
    const message = body.message ?? 'No se pudo leer la nota';
    throw new Error(`${code}: ${message}`);
  }
  return body.data;
}

export async function saveNoteReplace(
  ref: string,
  ifMatch: string,
  bodyHtml: string,
): Promise<SaveNoteResult> {
  const response = await apiFetch('/api/edit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'if-match': ifMatch,
    },
    body: JSON.stringify({ ref, mode: 'replace', html: bodyHtml }),
  });
  const payload = (await response.json()) as ApiEnvelope<{ hash: string }> & {
    code?: string;
    message?: string;
    error?: { code: string; message?: string; details?: { hash?: string } };
  };
  if (response.status === 409) {
    const code = payload.error?.code ?? payload.code ?? 'E_CONFLICT';
    const message =
      payload.error?.message ??
      payload.message ??
      'La nota cambió en otro sitio; no se guardó tu versión.';
    const hash = payload.error?.details?.hash;
    return { ok: false, status: 409, code, message, ...(hash !== undefined ? { hash } : {}) };
  }
  if (!response.ok || !payload.ok) {
    const code = payload.error?.code ?? payload.code ?? 'E_INTERNAL';
    const message = payload.error?.message ?? payload.message ?? 'No se pudo guardar la nota';
    return { ok: false, status: response.status, code, message };
  }
  return { ok: true, hash: payload.data.hash };
}
