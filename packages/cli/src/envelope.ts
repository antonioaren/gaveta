/** Bump this when the JSON envelope shape changes (REQ-CLI-01). */
export const SCHEMA_VERSION = 1;

/**
 * Unexpected failures. The catalog has no internal code; exit status still
 * comes from `EXIT_CODES.internal` in `@gaveta/core`.
 */
export const INTERNAL_ERROR_CODE = 'E_INTERNAL';

export const INTERNAL_ERROR_MESSAGE = 'Ha ocurrido un error interno.';

export const INTERNAL_ERROR_HINT =
  'Vuelve a ejecutar el comando. Si se repite, es un fallo de Gaveta.';

export interface JsonWarning {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
}

export interface JsonErrorBody {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface SuccessEnvelope {
  readonly ok: true;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly command: string;
  readonly data: unknown;
  readonly warnings: readonly JsonWarning[];
}

export interface FailureEnvelope {
  readonly ok: false;
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly command: string;
  readonly error: JsonErrorBody;
}

export function renderSuccess(
  command: string,
  data: unknown,
  warnings: readonly JsonWarning[],
): string {
  const envelope: SuccessEnvelope = {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    command,
    data,
    warnings,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function renderFailure(command: string, error: JsonErrorBody): string {
  const body: {
    code: string;
    message: string;
    hint: string;
    details?: Readonly<Record<string, unknown>>;
  } = {
    code: error.code,
    message: error.message,
    hint: error.hint,
  };
  if (error.details !== undefined) {
    body.details = error.details;
  }
  const envelope: FailureEnvelope = {
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    command,
    error: body,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function renderHumanError(error: JsonErrorBody): string {
  const lines = [`${error.code}: ${error.message}`, error.hint];
  const problem = error.details?.problem;
  if (typeof problem === 'string' && problem.length > 0) {
    lines.push(problem);
  }
  return `${lines.join('\n')}\n`;
}

export function renderHumanWarnings(warnings: readonly JsonWarning[]): string {
  return warnings
    .map((warning) => `${warning.code}: ${warning.message}\n${warning.hint}\n`)
    .join('');
}
