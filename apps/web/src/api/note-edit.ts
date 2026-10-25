import { formatMessage } from '@gaveta/i18n';
import { apiFetch, ApiError } from './client.ts';
import { readWebLocale } from '../i18n/read-web-locale.ts';
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
  const locale = readWebLocale();
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
    const message =
      body.error?.message ?? formatMessage('web.api.error.fallbackSaveNoteDot', locale);
    throw new ApiError(response.status, code, message);
  }
  return body.data;
}

export function conflictEditMessage(): string {
  return formatMessage('web.api.error.E_CONFLICT_EDIT', readWebLocale());
}

export function invalidHtmlMessage(): string {
  return formatMessage('web.api.error.invalidHtml', readWebLocale());
}
