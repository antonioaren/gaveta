import {
  GavetaError,
  GavetaOperationError,
  GavetaRefError,
  exitCodeFor,
  formatDiagnostic,
  isErrorCode,
} from '@gaveta/core';
import type { ApiErrorBody } from './envelope.ts';

const INTERNAL_ERROR_CODE = 'E_INTERNAL';
const INTERNAL_MESSAGE = 'Ha ocurrido un error interno.';
const INTERNAL_HINT = 'Vuelve a intentarlo. Si se repite, es un fallo de Gaveta.';

export function httpStatusForCode(code: string): number {
  if (code === INTERNAL_ERROR_CODE) {
    return 500;
  }
  if (!isErrorCode(code)) {
    return 500;
  }
  const exit = exitCodeFor(code);
  if (exit === 4) {
    return 404;
  }
  if (exit === 2) {
    return 422;
  }
  if (exit === 3) {
    return 409;
  }
  if (code === 'E_AUTH_REQUIRED') {
    return 401;
  }
  if (code === 'E_IF_MATCH_REQUIRED') {
    return 428;
  }
  if (code === 'E_ORIGIN_INVALID') {
    return 403;
  }
  if (exit === 5) {
    return 500;
  }
  return 400;
}

export function toApiErrorBody(error: unknown): ApiErrorBody {
  if (error instanceof GavetaRefError) {
    const formatted = formatDiagnostic(error.code);
    const details = { ...error.details };
    return {
      code: error.code,
      message: formatted.message,
      hint: formatted.hint,
      ...(Object.keys(details).length === 0 ? {} : { details }),
    };
  }
  if (error instanceof GavetaOperationError) {
    const formatted = formatDiagnostic(error.code);
    const details = { ...error.details };
    return {
      code: error.code,
      message: formatted.message,
      hint: formatted.hint,
      ...(Object.keys(details).length === 0 ? {} : { details }),
    };
  }
  if (error instanceof GavetaError) {
    const formatted = formatDiagnostic(error.code);
    return {
      code: error.code,
      message: formatted.message,
      hint: formatted.hint,
    };
  }
  return {
    code: INTERNAL_ERROR_CODE,
    message: INTERNAL_MESSAGE,
    hint: INTERNAL_HINT,
  };
}
