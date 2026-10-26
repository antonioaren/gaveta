import {
  GavetaError,
  backlinks,
  doctorVault,
  globalGraph,
  localGraph,
  outgoingLinks,
  listTasks,
  readNote,
  unlinkedMentions,
  completeWikilinkTargets,
  readRenderNoteId,
  readVaultConfig,
  resolveRenderNote,
} from '@gaveta/core';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  assertAllowedHost,
  assertAllowedOrigin,
  assertSingleHostHeader,
  assertServeHost,
  buildAppUrl,
  createRenderTicketSecret,
  createSessionToken,
  readRequestToken,
} from './auth.ts';
import {
  API_WRITE_BODY_LIMIT_BYTES,
  GAVETA_SERVE_DEFAULT_PORT,
  GAVETA_SERVE_HOST,
  GAVETA_TOKEN_HEADER,
} from './constants.ts';
import { apiFailure, apiSuccess } from './envelope.ts';
import { httpStatusForCode, localeFromRequestHeaders, toApiErrorBody } from './http-error.ts';
import {
  presentBacklink,
  presentFinding,
  presentFix,
  presentGraph,
  presentHit,
  presentListedTask,
  presentMention,
  presentNoteList,
  presentOutgoing,
  presentRead,
  presentWikilinkCompletion,
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
  readWikilinkCompleteQuery,
  readSearchTag,
  readSearchType,
  readTaskListQuery,
  rejectDepthWithoutRef,
  toSearchOptions,
} from './query.ts';
import { readRenderTicketFromRequest } from './render-access.ts';
import { createRenderTicket, renderTicketExpiresAt } from './render-ticket.ts';
import { registerRenderRoutes } from './render-routes.ts';
import {
  isPublicShellRoute,
  isRenderRoute,
  normalizeServePath,
  requiresSessionToken,
} from './route-access.ts';
import {
  applyAppShellHeaders,
  applyRenderTransportHeaders,
  applySecurityHeaders,
} from './security-headers.ts';
import { registerWebApp } from './static-web.ts';
import { registerSanitizePasteRoute } from './sanitize-paste-route.ts';
import { registerWriteRoutes } from './write-routes.ts';
import { registerMigrationRoutes } from './migration-routes.ts';
import { registerFormatNoteRoute } from './format-note-route.ts';
import { registerValidateRoutes } from './validate-route.ts';
import { registerVsCodeUriRoute } from './vscode-uri-route.ts';
import { VaultEventBus } from './vault-events.ts';
import { createVaultWatcher, type VaultWatcher } from './vault-watcher.ts';
import { VaultIndexSession } from './vault-index.ts';
import { registerVaultWebSocket } from './websocket.ts';

export interface CreateGavetaServerOptions {
  readonly vaultRoot: string;
  readonly host?: string;
  readonly port?: number;
  readonly token?: string;
  readonly renderTicketSecret?: string;
  readonly cliVersion?: string;
  /** Built output of @gaveta/web; when set, gaveta serve also serves the viewer shell. */
  readonly webRoot?: string;
  /** Shorter auth window for WebSocket tests. */
  readonly webSocketAuthTimeoutMs?: number;
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
  const renderTicketSecret = options.renderTicketSecret ?? createRenderTicketSecret();
  const requestedPort = options.port ?? GAVETA_SERVE_DEFAULT_PORT;
  const vaultSession = new VaultIndexSession(options.vaultRoot);
  const vaultEvents = new VaultEventBus();
  let vaultWatcher: VaultWatcher | null = null;
  let boundPort = requestedPort;
  let shutdownPromise: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;
  let onSignal: (() => void) | null = null;

  const app = Fastify({
    logger: false,
    bodyLimit: API_WRITE_BODY_LIMIT_BYTES,
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
    const method = request.method.toUpperCase();
    if (
      method !== 'GET' &&
      method !== 'HEAD' &&
      method !== 'POST' &&
      method !== 'PATCH' &&
      method !== 'DELETE'
    ) {
      throw new GavetaError('E_ARG_INVALID');
    }
    const normalizedPath = normalizeServePath(request.url);
    if (
      requiresSessionToken(request.method, normalizedPath) &&
      !readRequestToken(request.headers, token)
    ) {
      throw new GavetaError('E_AUTH_REQUIRED');
    }
    if (isRenderRoute(request.method, normalizedPath)) {
      readRenderTicketFromRequest(request);
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    await Promise.resolve();
    const normalizedPath = normalizeServePath(request.url);
    if (isRenderRoute(request.method, normalizedPath)) {
      applyRenderTransportHeaders(reply);
    } else if (
      options.webRoot !== undefined &&
      isPublicShellRoute(request.method, normalizedPath)
    ) {
      applyAppShellHeaders(reply);
    } else {
      applySecurityHeaders(reply);
    }
    return payload;
  });

  registerReadRoutes(app, options, vaultSession, () => boundPort, renderTicketSecret);
  registerVsCodeUriRoute(app, options, vaultSession);
  registerWriteRoutes(app, options, vaultSession);
  registerValidateRoutes(app);
  registerFormatNoteRoute(app, options);
  registerSanitizePasteRoute(app, options);
  registerRenderRoutes(
    app,
    options,
    vaultSession,
    { ticketSecret: renderTicketSecret },
    () => boundPort,
  );

  app.setErrorHandler((error, request, reply) => {
    sendError(request, reply, error);
  });

  return {
    app,
    async listen(): Promise<GavetaServerAddress> {
      if (options.webRoot !== undefined) {
        await registerWebApp(app, options.webRoot);
      }
      await registerMigrationRoutes(app, {
        vaultRoot: options.vaultRoot,
        sessionToken: token,
      });
      await registerVaultWebSocket(app, token, vaultEvents, options.webSocketAuthTimeoutMs);
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
      vaultWatcher = createVaultWatcher({
        vaultRoot: options.vaultRoot,
        session: vaultSession,
        bus: vaultEvents,
      });
      await vaultWatcher.whenReady();
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
      if (vaultWatcher !== null) {
        await vaultWatcher.close();
        vaultWatcher = null;
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
          void (async () => {
            if (vaultWatcher !== null) {
              await vaultWatcher.close();
              vaultWatcher = null;
            }
            await app.close();
            vaultSession.close();
            if (resolveShutdown !== null) {
              resolveShutdown();
            }
          })();
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
  renderTicketSecret: string,
): void {
  app.get(BOOTSTRAP_PATH, (_request, reply) => {
    const data = {
      host: GAVETA_SERVE_HOST,
      port: port(),
    };
    return reply.send(apiSuccess(data));
  });

  app.get('/api/render-ticket', async (request, reply) => {
    const id = readRenderNoteId(readQueryParam(request, 'id') ?? '');
    await vaultSession.withIndex(async (index) => {
      resolveRenderNote(index, id);
      return Promise.resolve();
    });
    const ticket = createRenderTicket(renderTicketSecret, id);
    const expiresAt = renderTicketExpiresAt(ticket);
    return reply.send(
      apiSuccess({
        id,
        ticket,
        expiresAt,
      }),
    );
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
    const note = await readNote({
      vaultRoot: options.vaultRoot,
      ref,
      as,
      locale: localeFromRequestHeaders(request.headers),
    });
    return reply.send(apiSuccess(presentRead(note)));
  });

  app.get('/api/tasks', async (request, reply) => {
    const filters = readTaskListQuery(request.query as Record<string, string | undefined>);
    const listed = await listTasks({
      vaultRoot: options.vaultRoot,
      ...filters,
    });
    return reply.send(
      apiSuccess({
        tasks: listed.tasks.map(presentListedTask),
      }),
    );
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

  app.get('/api/mentions', async (request, reply) => {
    const ref = readRefQuery(readQueryParam(request, 'ref'));
    const { result, warnings } = await vaultSession.withIndex(async (index) => {
      const mentions = await unlinkedMentions(options.vaultRoot, index, ref);
      return { ref, mentions: mentions.map(presentMention) };
    });
    return reply.send(apiSuccess(result, warnings));
  });

  app.get('/api/graph', async (request, reply) => {
    const ref = readOptionalRefQuery(readQueryParam(request, 'ref'));
    const depthParam = readQueryParam(request, 'depth');
    rejectDepthWithoutRef(depthParam, ref);
    const graphQuery: { type?: string; tag?: string; rel?: string; folder?: string } = {};
    const graphType = readQueryParam(request, 'type');
    const graphTag = readQueryParam(request, 'tag');
    const graphRel = readQueryParam(request, 'rel');
    const graphFolder = readQueryParam(request, 'folder');
    if (graphType !== undefined) {
      graphQuery.type = graphType;
    }
    if (graphTag !== undefined) {
      graphQuery.tag = graphTag;
    }
    if (graphRel !== undefined) {
      graphQuery.rel = graphRel;
    }
    if (graphFolder !== undefined) {
      graphQuery.folder = graphFolder;
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

  app.get('/api/wikilink-complete', async (request, reply) => {
    const query = readWikilinkCompleteQuery(readQueryParam(request, 'q'));
    const limit = readSearchLimit(readQueryParam(request, 'limit'));
    const { result, warnings } = await vaultSession.withIndex((index) => {
      const hits = completeWikilinkTargets(index, query, limit).map(presentWikilinkCompletion);
      return Promise.resolve({ query, limit, hits });
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
    const { result: enriched } = await vaultSession.withIndex((index) => {
      const noteIdByPath = new Map(index.notes().map((note) => [note.path, note.id]));
      const findings = report.findings.map((finding) =>
        presentFinding(finding, noteIdByPath.get(finding.path) ?? null),
      );
      const fixed = report.fixed.map(presentFix);
      return Promise.resolve({ findings, fixed });
    });
    const data = { ok: report.ok, findings: enriched.findings, fixed: enriched.fixed };
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

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const body = toApiErrorBody(error, localeFromRequestHeaders(request.headers));
  const status = httpStatusForCode(body.code);
  if (!reply.sent) {
    return reply.code(status).send(apiFailure(body));
  }
  return reply;
}

export { GAVETA_TOKEN_HEADER };
