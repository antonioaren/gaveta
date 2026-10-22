import { GavetaError, type ErrorCode } from '../errors.ts';

/** An operation error that carries `details` for the JSON envelope. */
export class GavetaOperationError extends GavetaError {
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    params: Readonly<Record<string, string | number>>,
    details: Readonly<Record<string, unknown>>,
  ) {
    super(code, params);
    this.name = 'GavetaOperationError';
    this.details = details;
  }
}
