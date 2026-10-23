import {
  GavetaError,
  backlinks,
  doctorVault,
  globalGraph,
  localGraph,
  outgoingLinks,
  readNote,
  readVaultConfig,
} from '@gaveta/core';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  assertAllowedHost,
  assertAllowedOrigin,
  assertSingleHostHeader,
  assertServeHost,
  buildAppUrl,
  createSessionToken,
  readRequestToken,
} from './auth.ts';
import { GAVETA_SERVE_DEFAULT_PORT, GAVETA_SERVE_HOST, GAVETA_TOKEN_HEADER } from './constants.ts';
import { apiFailure, apiSuccess } from './envelope.ts';
import { httpStatusForCode, toApiErrorBody } from './http-error.ts';
import {
  presentBacklink,
  presentFinding,
  presentFix,
  presentGraph,
  presentHit,
  presentNoteList,
  presentOutgoing,
  presentRead,
} from './present.ts';
import {
  quoteFtsQuery,
  readGraphFilters,
  readLocalDepth,
  readOptionalRefQuery,
  readReadAs,
  readRefQuery,
  readSearchLimit,
  readSearchQuery,
  readSearchTag,
  readSearchType,
  rejectDepthWithoutRef,
  toSearchOptions,
} from './query.ts';
import { applyAppShellHeaders, applySecurityHeaders, isApiPath } from './security-headers.ts';
import { registerWebApp } from './static-web.ts';
import { VaultIndexSession } from './vault-index.ts';

export interface CreateGavetaServerOptions {
  readonly vaultRoot: string;
  readonly host?: string;
  readonly port?: number;
  readonly token?: string;
  readonly cliVersion?: string;
  /** Built output of @gaveta/web; when set, gaveta serve also serves the viewer shell. */
  readonly webRoot?: string;
}

export interface GavetaServerAddress {
  readonly host: string;
  readonly port: number;
  readonly token: string;
  readonly url: string;
}

export interface GavetaServer {
  readonly app: FastifyInstance;
  listen(): Promise<GavetaServerAddress>;
  close(): Promise<void>;
  waitForShutdown(): Promise<void>;
}

const BOOTSTRAP_PATH = '/api/session';

export function createGavetaServer(options: CreateGavetaServerOptions): GavetaServer {
  const host = options.host ?? GAVETA_SERVE_HOST;
  assertServeHost(host);
  const token = options.token ?? createSessionToken();
  const requestedPort = options.port ?? GAVETA_SERVE_DEFAULT_PORT;
  const vaultSession = new VaultIndexSession(options.vaultRoot);
  let boundPort = requestedPort;
  let shutdownPromise: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;
  let onSignal: (() => void) | null = null;

  const app = Fastify({
    logger: false,
    routerOptions: { ignoreTrailingSlash: true },
  });

  app.addHook('onRequest', async (request) => {
    await Promise.resolve();
    assertSingleHostHeader(request.raw.rawHeaders);
    assertAllowedHost(request.headers.host, boundPort);
    assertAllowedOrigin(
      typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
      boundPort,
    );
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw new GavetaError('E_ARG_INVALID');
    }
    if (isApiPath(request.url) && !readRequestToken(request.headers, token)) {
      throw new GavetaError('E_AUTH_REQUIRED');
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    await Promise.resolve();
    if (isApiPath(request.url)) {
      applySecurityHeaders(reply);
    } else if (options.webRoot !== undefined) {
      applyAppShellHeaders(reply);
    } else {
      applySecurityHeaders(reply);
    }
    return payload;
  });

  registerReadRoutes(app, options, vaultSession, () => boundPort);

  app.setErrorHandler((error, _request, reply) => {
    sendError(reply, error);
  });

  return {
    app,
    async listen(): Promise<GavetaServerAddress> {
      if (options.webRoot !== undefined) {
        await registerWebApp(app, options.webRoot);
      }
      await app.listen({
        host,
        port: requestedPort,
        listenTextResolver: () => '',
      });
      const address = app.server.address();
      if (address === null || typeof address === 'string') {
        throw new GavetaError('E_ARG_INVALID');
      }
      boundPort = address.port;
      return {
        host,
        port: boundPort,
        token,
        url: buildAppUrl(boundPort, token),
      };
    },
    async close(): Promise<void> {
      if (onSignal !== null) {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
        onSignal = null;
      }
      await app.close();
      vaultSession.close();
      if (resolveShutdown !== null) {
        resolveShutdown();
      }
    },
    waitForShutdown(): Promise<void> {
      if (shutdownPromise === null) {
        shutdownPromise = new Promise((resolve) => {
          resolveShutdown = resolve;
        });
        onSignal = (): void => {
          void app.close().then(() => {
            vaultSession.close();
            if (resolveShutdown !== null) {
              resolveShutdown();
            }
          });
        };
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
      }
      return shutdownPromise;
    },
  };
}

function registerReadRoutes(
  app: FastifyInstance,
  options: CreateGavetaServerOptions,
  vaultSession: VaultIndexSession,
  port: () => number,
): void {
  app.get(BOOTSTRAP_PATH, (_request, reply) => {
    const data = {
      host: GAVETA_SERVE_HOST,
      port: port(),
    };
    return reply.send(apiSuccess(data));
  });

  app.get('/api/notes', async (_request, reply) => {
    const { result, warnings } = await vaultSession.withIndex((index) => {
      return Promise.resolve(presentNoteList(index.notes()));
    });
    return reply.send(apiSuccess({ notes: result }, warnings));
  });

  app.get('/api/read', async (request, reply) => {
    const ref = readRefQuery(readQueryParam(request, 'ref'));
    const as = readReadAs(readQueryParam(request, 'as'));
    const note = await readNote({ vaultRoot: options.vaultRoot, ref, as });
    return reply.send(apiSuccess(presentRead(note)));
  });

  app.get('/api/links', async (request, reply) => {
    const ref = readRefQuery(readQueryParam(request, 'ref'));
    const { result, warnings } = await vaultSession.withIndex((index) => {
      const links = outgoingLinks(index, ref).map(presentOutgoing);
      return Promise.resolve({ ref, links });
    });
    return reply.send(apiSuccess(result, warnings));
  });

  app.get('/api/backlinks', async (request, reply) => {
    const ref = readRefQuery(readQueryParam(request, 'ref'));
    const { result, warnings } = await vaultSession.withIndex((index) => {
      const incoming = backlinks(index, ref).map(presentBacklink);
      return Promise.resolve({ ref, backlinks: incoming });
    });
    return reply.send(apiSuccess(result, warnings));
  });

  app.get('/api/graph', async (request, reply) => {
    const ref = readOptionalRefQuery(readQueryParam(request, 'ref'));
    const depthParam = readQueryParam(request, 'depth');
    rejectDepthWithoutRef(depthParam, ref);
    const graphQuery: { type?: string; tag?: string; rel?: string } = {};
    const graphType = readQueryParam(request, 'type');
    const graphTag = readQueryParam(request, 'tag');
    const graphRel = readQueryParam(request, 'rel');
    if (graphType !== undefined) {
      graphQuery.type = graphType;
    }
    if (graphTag !== undefined) {
      graphQuery.tag = graphTag;
    }
    if (graphRel !== undefined) {
      graphQuery.rel = graphRel;
    }
    const filters = readGraphFilters(graphQuery);
    const { result, warnings } = await vaultSession.withIndex((index) => {
      if (ref === undefined) {
        const graph = globalGraph(index, filters);
        return Promise.resolve(presentGraph(undefined, undefined, filters, graph));
      }
      const depth = readLocalDepth(depthParam);
      const graph = localGraph(index, ref, { depth, ...filters });
      return Promise.resolve(presentGraph(ref, depth, filters, graph));
    });
    return reply.send(apiSuccess(result, warnings));
  });

  app.get('/api/search', async (request, reply) => {
    const query = readSearchQuery(readQueryParam(request, 'q'));
    const type = readSearchType(readQueryParam(request, 'type'));
    const tag = readSearchTag(readQueryParam(request, 'tag'));
    const limit = readSearchLimit(readQueryParam(request, 'limit'));
    const search = toSearchOptions(type, tag, limit);
    const { result, warnings } = await vaultSession.withIndex((index) => {
      const hits = index.search(quoteFtsQuery(query), search).map(presentHit);
      return Promise.resolve({ query, type, tag, limit, hits });
    });
    return reply.send(apiSuccess(result, warnings));
  });

  app.get('/api/doctor', async (_request, reply) => {
    const config = await readVaultConfig(options.vaultRoot);
    const report = await doctorVault(options.vaultRoot, {
      fix: false,
      strictRel: config.rel.strict,
      cliVersion: options.cliVersion ?? '0.0.0',
    });
    const data = {
      ok: report.ok,
      findings: report.findings.map(presentFinding),
      fixed: report.fixed.map(presentFix),
    };
    return reply.send(apiSuccess(data));
  });
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

function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  const body = toApiErrorBody(error);
  const status = httpStatusForCode(body.code);
  if (!reply.sent) {
    return reply.code(status).send(apiFailure(body));
  }
  return reply;
}

export { GAVETA_TOKEN_HEADER };
