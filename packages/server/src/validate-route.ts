import { validateNote, type NoteDiagnostic } from '@gaveta/core';
import type { FastifyInstance } from 'fastify';
import { apiSuccess } from './envelope.ts';
import {
  assertAllowedKeys,
  readJsonObjectBody,
  requiredNoteHtmlField,
  requiredStringField,
} from './write-body.ts';

function presentDiagnostic(diagnostic: NoteDiagnostic): Record<string, unknown> {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    hint: diagnostic.hint,
    location: diagnostic.location,
    details: diagnostic.details,
  };
}

export function registerValidateRoutes(app: FastifyInstance): void {
  app.post('/api/validate', async (request, reply) => {
    const body = readJsonObjectBody(request);
    assertAllowedKeys(body, ['html', 'path']);
    const html = requiredNoteHtmlField(body, 'html');
    const path = requiredStringField(body, 'path');
    const result = validateNote(html, { notePath: path });
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    return reply.send(
      apiSuccess({
        ok: result.ok && errors.length === 0,
        diagnostics: result.diagnostics.map(presentDiagnostic),
        errorCount: errors.length,
      }),
    );
  });
}
