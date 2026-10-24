import { GavetaError, parseNoteContentHash } from '@gaveta/core';
import type { FastifyRequest } from 'fastify';

const IF_MATCH_HEADER = 'if-match';

export function readWriteIfMatch(
  request: FastifyRequest,
  body: Record<string, unknown> | null,
): string | undefined {
  const header = request.headers[IF_MATCH_HEADER];
  if (header !== undefined) {
    if (Array.isArray(header)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    return parseNoteContentHash(header.trim());
  }
  if (body !== null && Object.hasOwn(body, 'ifMatch')) {
    const value = body.ifMatch;
    if (typeof value !== 'string') {
      throw new GavetaError('E_ARG_INVALID');
    }
    return parseNoteContentHash(value.trim());
  }
  return undefined;
}
