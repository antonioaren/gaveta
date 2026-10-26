import { GavetaError, buildVsCodeFileUri, resolveInsideVault, resolveRef } from '@gaveta/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { apiSuccess } from './envelope.ts';
import { readRefQuery } from './query.ts';
import type { VaultIndexSession } from './vault-index.ts';

export interface VsCodeUriRouteOptions {
  readonly vaultRoot: string;
}

function readQueryParam(request: FastifyRequest, name: string): string | undefined {
  const query = request.query as Record<string, string | string[] | undefined>;
  const value = query[name];
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

export function registerVsCodeUriRoute(
  app: FastifyInstance,
  options: VsCodeUriRouteOptions,
  vaultSession: VaultIndexSession,
): void {
  app.get('/api/note/vscode-uri', async (request, reply) => {
    const ref = readRefQuery(readQueryParam(request, 'ref'));
    const { result: notePath } = await vaultSession.withIndex((index) => {
      const resolved = resolveRef(index, ref);
      return Promise.resolve(resolved.path);
    });
    const absolutePath = await resolveInsideVault(options.vaultRoot, notePath);
    const uri = buildVsCodeFileUri(absolutePath);
    return reply.send(apiSuccess({ uri }));
  });
}
