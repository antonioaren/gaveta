import { normalizeNote, readVaultConfig } from '@gaveta/core';
import type { FastifyInstance } from 'fastify';
import { apiSuccess } from './envelope.ts';
import { assertAllowedKeys, readJsonObjectBody, requiredStringField } from './write-body.ts';

const CARRIER_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHE';
const CARRIER_CREATED = '2026-10-22T12:00:00.000Z';

function bodyInnerFromDocument(html: string): string {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return match?.[1]?.trim() ?? '';
}

export interface SanitizePasteRouteOptions {
  readonly vaultRoot: string;
}

export function registerSanitizePasteRoute(
  app: FastifyInstance,
  options: SanitizePasteRouteOptions,
): void {
  app.post('/api/sanitize-paste', async (request, reply) => {
    const body = readJsonObjectBody(request);
    assertAllowedKeys(body, ['html', 'notePath']);
    const fragment = requiredStringField(body, 'html');
    const notePath = requiredStringField(body, 'notePath');
    const config = await readVaultConfig(options.vaultRoot);
    const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Fragmento</title><meta name="gaveta:id" content="${CARRIER_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="${CARRIER_CREATED}"></head><body>${fragment}</body></html>`;
    const normalized = normalizeNote(shell, {
      notePath,
      remoteAllowlist: config.remoteAllowlist,
    });
    if (!normalized.ok || normalized.html === null) {
      return reply.send(apiSuccess({ html: '' }));
    }
    const inner = bodyInnerFromDocument(normalized.html);
    return reply.send(apiSuccess({ html: inner }));
  });
}
