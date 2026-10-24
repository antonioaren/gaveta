import { apiFetch, ApiError } from './client.ts';
import type { ApiEnvelope } from './types.ts';

export interface EditNoteResult {
  readonly hash: string;
  readonly path: string;
  readonly title: string;
}

export async function saveNoteDocument(
  ref: string,
  html: string,
  ifMatch: string,
): Promise<EditNoteResult> {
  const response = await apiFetch('/api/edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': ifMatch,
    },
    body: JSON.stringify({
      ref,
      mode: 'replace',
      scope: 'document',
      html,
      ifMatch,
    }),
  });
  const body = (await response.json()) as ApiEnvelope<EditNoteResult> & {
    ok: boolean;
    error?: { code: string; message: string; hint?: string };
  };
  if (!response.ok || !body.ok) {
    const code = body.error?.code ?? 'E_INTERNAL';
    const message = body.error?.message ?? 'No se pudo guardar la nota.';
    throw new ApiError(response.status, code, message);
  }
  return body.data;
}

export const CONFLICT_MESSAGE =
  'La nota cambió en otro sitio. Recarga el contenido antes de volver a guardar.';

export const INVALID_HTML_MESSAGE =
  'El HTML no es válido. Corrige los errores marcados en el editor antes de guardar.';
