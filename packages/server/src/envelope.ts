import { formatDiagnostic, type WarningCode } from '@gaveta/core';
import { API_SCHEMA_VERSION } from './constants.ts';

export interface ApiWarning {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
}

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ApiSuccessEnvelope {
  readonly ok: true;
  readonly schemaVersion: typeof API_SCHEMA_VERSION;
  readonly data: unknown;
  readonly warnings: readonly ApiWarning[];
}

export interface ApiFailureEnvelope {
  readonly ok: false;
  readonly schemaVersion: typeof API_SCHEMA_VERSION;
  readonly error: ApiErrorBody;
}

export function apiSuccess(
  data: unknown,
  warnings: readonly ApiWarning[] = [],
): ApiSuccessEnvelope {
  return {
    ok: true,
    schemaVersion: API_SCHEMA_VERSION,
    data,
    warnings,
  };
}

export function apiFailure(error: ApiErrorBody): ApiFailureEnvelope {
  const body: ApiErrorBody = {
    code: error.code,
    message: error.message,
    hint: error.hint,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
  return {
    ok: false,
    schemaVersion: API_SCHEMA_VERSION,
    error: body,
  };
}

export function renderApiSuccess(data: unknown, warnings: readonly ApiWarning[] = []): string {
  return JSON.stringify(apiSuccess(data, warnings));
}

export function renderApiFailure(error: ApiErrorBody): string {
  return JSON.stringify(apiFailure(error));
}

export function warningFromCode(
  code: WarningCode,
  params: Readonly<Record<string, string | number>> = {},
): ApiWarning {
  const formatted = formatDiagnostic(code, params);
  return { code, message: formatted.message, hint: formatted.hint };
}
