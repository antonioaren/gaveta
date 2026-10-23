import {
  GavetaError,
  assertNoteAttachmentPathAllowed,
  buildNoteRenderCsp,
  buildNoteRenderPage,
  collectNoteAttachmentPaths,
  normalizeNote,
  readRenderNoteId,
  readVaultConfig,
  readVaultText,
  resolveInsideVault,
  resolveRenderNote,
} from '@gaveta/core';
import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import type { CreateGavetaServerOptions } from './create-server.ts';
import {
  assertRenderTicketForNote,
  assertRenderTicketForStatic,
  readRenderTicketFromRequest,
} from './render-access.ts';
import { RENDER_FILE_CSP, contentDispositionForVaultFile } from './render-file.ts';
import { isAllowedRenderStaticName, readRenderStaticFile } from './render-static.ts';
import type { VaultIndexSession } from './vault-index.ts';

export interface RegisterRenderRoutesOptions {
  readonly ticketSecret: string;
}

export function registerRenderRoutes(
  app: FastifyInstance,
  options: CreateGavetaServerOptions,
  vaultSession: VaultIndexSession,
  renderOptions: RegisterRenderRoutesOptions,
  port: () => number,
): void {
  const secret = renderOptions.ticketSecret;

  app.get('/render/static/:name', async (request, reply) => {
    const ticket = readRenderTicketFromRequest(request);
    assertRenderTicketForStatic(secret, ticket);
    const name = readStaticName(request.params);
    if (!isAllowedRenderStaticName(name)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    const file = readRenderStaticFile(name);
    return reply.type(file.contentType).send(file.body);
  });

  app.get('/render/:id/file/*', async (request, reply) => {
    const ticket = readRenderTicketFromRequest(request);
    const id = readRenderNoteId(readRouteParam(request.params, 'id'));
    assertRenderTicketForNote(secret, ticket, id);
    const relative = readWildcardPath(request);
    const { result } = await vaultSession.withIndex(async (index) => {
      const note = resolveRenderNote(index, id);
      if (note.id === null) {
        throw new GavetaError('E_META_MISSING');
      }
      const config = await readVaultConfig(options.vaultRoot);
      const sourceHtml = await readVaultText(options.vaultRoot, note.path);
      const normalized = normalizeNote(sourceHtml, {
        notePath: note.path,
        remoteAllowlist: config.remoteAllowlist,
      });
      if (!normalized.ok || normalized.html === null) {
        throw new GavetaError('E_HTML_INVALID');
      }
      const allowed = new Set(collectNoteAttachmentPaths(normalized.html, note.path));
      const vaultRelative = assertNoteAttachmentPathAllowed(relative, allowed);
      const absolute = await resolveInsideVault(options.vaultRoot, vaultRelative);
      const body = await readFile(absolute);
      return { body, path: vaultRelative };
    });
    const contentType = contentTypeForPath(result.path);
    return reply
      .type(contentType)
      .header('Content-Security-Policy', RENDER_FILE_CSP)
      .header('Content-Disposition', contentDispositionForVaultFile(result.path))
      .send(result.body);
  });

  app.get('/render/:id', async (request, reply) => {
    const ticket = readRenderTicketFromRequest(request);
    const id = readRenderNoteId(readRouteParam(request.params, 'id'));
    assertRenderTicketForNote(secret, ticket, id);
    const config = await readVaultConfig(options.vaultRoot);
    const { result: page } = await vaultSession.withIndex(async (index) => {
      const note = resolveRenderNote(index, id);
      if (note.id === null) {
        throw new GavetaError('E_META_MISSING');
      }
      const sourceHtml = await readVaultText(options.vaultRoot, note.path);
      return buildNoteRenderPage({
        noteId: note.id,
        notePath: note.path,
        title: note.title,
        sourceHtml,
        port: port(),
        renderTicket: ticket,
        remoteAllowlist: config.remoteAllowlist,
      });
    });
    const csp = buildNoteRenderCsp(port());
    return reply.type('text/html; charset=utf-8').header('Content-Security-Policy', csp).send(page);
  });
}

function readRouteParam(params: unknown, name: string): string {
  if (typeof params !== 'object' || params === null) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const value = (params as Record<string, string | undefined>)[name];
  if (value === undefined) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function readStaticName(params: unknown): string {
  const name = readRouteParam(params, 'name');
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return name;
}

function readWildcardPath(request: { params: unknown; url: string }): string {
  const params = request.params as Record<string, string | undefined>;
  const star = params['*'];
  if (star === undefined || star.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const decoded = decodeURIComponent(star);
  if (decoded.includes('\\') || decoded.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return decoded;
}

function contentTypeForPath(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.gif')) {
    return 'image/gif';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  if (lower.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (lower.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (lower.endsWith('.mp4')) {
    return 'video/mp4';
  }
  return 'application/octet-stream';
}
