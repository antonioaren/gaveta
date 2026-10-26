import { normalizeNote, readVaultConfig, type NoteDiagnostic } from '@gaveta/core';
import type { FastifyInstance } from 'fastify';
import { apiSuccess } from './envelope.ts';
import {
  assertAllowedKeys,
  readJsonObjectBody,
  requiredNoteHtmlField,
  requiredStringField,
} from './write-body.ts';

export interface FormatNoteRouteOptions {
  readonly vaultRoot: string;
}

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

export function registerFormatNoteRoute(
  app: FastifyInstance,
  options: FormatNoteRouteOptions,
): void {
  app.post('/api/format-note', async (request, reply) => {
    const body = readJsonObjectBody(request);
    assertAllowedKeys(body, ['html', 'path']);
    const html = requiredNoteHtmlField(body, 'html');
    const path = requiredStringField(body, 'path');
    const config = await readVaultConfig(options.vaultRoot);
    const normalized = normalizeNote(html, {
      notePath: path,
      remoteAllowlist: config.remoteAllowlist,
    });
    const errors = normalized.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    const formattedHtml = normalized.html ?? '';
    return reply.send(
      apiSuccess({
        ok: normalized.ok && errors.length === 0 && formattedHtml.length > 0,
        html: formattedHtml,
        diagnostics: normalized.diagnostics.map(presentDiagnostic),
        errorCount: errors.length,
      }),
    );
  });
}
