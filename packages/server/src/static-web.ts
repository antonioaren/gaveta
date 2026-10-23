import fastifyStatic from '@fastify/static';
import { GavetaError } from '@gaveta/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { apiFailure } from './envelope.ts';
import { toApiErrorBody } from './http-error.ts';

export async function registerWebApp(app: FastifyInstance, webRoot: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: webRoot,
    wildcard: false,
    index: false,
  });

  const sendShell = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('index.html', webRoot);
  };

  app.get('/', sendShell);
  app.get('/nota', sendShell);
  app.get('/nota/*', sendShell);

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (path.startsWith('/api/')) {
      const body = toApiErrorBody(new GavetaError('E_ARG_INVALID'));
      void reply.code(404).send(apiFailure(body));
      return;
    }
    void reply.code(404).send();
  });
}
