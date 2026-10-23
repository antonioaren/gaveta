import { getSessionToken } from '../auth/session-token.ts';

const GAVETA_TOKEN_HEADER = 'x-gaveta-token';
import type { ApiEnvelope } from './types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init.headers);
  if (token !== null) {
    headers.set(GAVETA_TOKEN_HEADER, token);
  }
  return fetch(path, { ...init, headers });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await apiFetch(path, init);
  const body = (await response.json()) as ApiEnvelope<T> & { code?: string; message?: string };
  if (!response.ok || !body.ok) {
    const code = body.code ?? 'E_INTERNAL';
    const message = body.message ?? 'Error de la API';
    throw new ApiError(response.status, code, message);
  }
  return body;
}
