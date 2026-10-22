import { GavetaError, type ErrorCode } from '@gaveta/core';

/** A catalog error plus optional JSON `details` for the envelope. */
export class CliFailure extends GavetaError {
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    params: Readonly<Record<string, string | number>> = {},
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(code, params);
    this.name = 'CliFailure';
    if (details !== undefined) {
      this.details = details;
    }
  }
}
