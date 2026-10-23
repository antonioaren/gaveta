import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { apiFailure } from './envelope.ts';
import { toApiErrorBody } from './http-error.ts';
import { GavetaError } from '@gaveta/core';

export function assertWebRoot(webRoot: string): void {
  const indexPath = join(webRoot, 'index.html');
  if (!existsSync(indexPath)) {
    throw new GavetaError('E_ARG_INVALID');
  }
}

export async function registerWebApp(app: FastifyInstance, webRoot: string): Promise<void> {
  assertWebRoot(webRoot);
  await app.register(fastifyStatic, {
    root: webRoot,
    wildcard: false,
    index: false,
  });

  app.get('/', async (_request, reply) => {
    return reply.sendFile('index.html', webRoot);
  });

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (path.startsWith('/api/')) {
      const body = toApiErrorBody(new GavetaError('E_ARG_INVALID'));
      void reply.code(404).send(apiFailure(body));
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      void reply.sendFile('index.html', webRoot);
      return;
    }
    void reply.code(404).send();
  });
}
