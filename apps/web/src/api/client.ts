import { getSessionToken } from '../auth/session-token.ts';

const GAVETA_TOKEN_HEADER = 'x-gaveta-token';
import type { ApiEnvelope } from './types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
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
    const errorBody = body as {
      code?: string;
      message?: string;
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    };
    const nested = errorBody.error;
    const code = errorBody.code ?? nested?.code ?? 'E_INTERNAL';
    const message = errorBody.message ?? nested?.message ?? 'Error de la API';
    const details = nested?.details ?? (body as { details?: Record<string, unknown> }).details;
    throw new ApiError(response.status, code, message, details);
  }
  return body;
}
