import { getSessionToken } from '../auth/session-token.ts';

const GAVETA_TOKEN_HEADER = 'x-gaveta-token';

export async function sanitizePasteViaApi(html: string, notePath: string): Promise<string> {
  const headers = new Headers({ 'content-type': 'application/json' });
  const token = getSessionToken();
  if (token !== null) {
    headers.set(GAVETA_TOKEN_HEADER, token);
  }
  const response = await fetch('/api/sanitize-paste', {
    method: 'POST',
    headers,
    body: JSON.stringify({ html, notePath }),
  });
  const body = (await response.json()) as { ok: boolean; data?: { html: string } };
  if (!response.ok || !body.ok || body.data === undefined) {
    return '';
  }
  return body.data.html;
}
