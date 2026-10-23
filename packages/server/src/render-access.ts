import { GavetaError } from '@gaveta/core';
import type { FastifyRequest } from 'fastify';
import { verifyRenderTicket, verifyRenderTicketPayload } from './render-ticket.ts';

export function readRenderTicketFromRequest(request: FastifyRequest): string {
  rejectSessionTokenInRenderQuery(request);
  const query = request.query as Record<string, string | string[] | undefined>;
  const ticket = query.t;
  if (ticket === undefined || Array.isArray(ticket)) {
    throw new GavetaError('E_AUTH_REQUIRED');
  }
  if (ticket.length === 0) {
    throw new GavetaError('E_AUTH_REQUIRED');
  }
  return ticket;
}

export function assertRenderTicketForNote(secret: string, ticket: string, noteId: string): void {
  if (!verifyRenderTicket(secret, noteId, ticket)) {
    throw new GavetaError('E_AUTH_REQUIRED');
  }
}

export function assertRenderTicketForStatic(secret: string, ticket: string): void {
  if (verifyRenderTicketPayload(secret, ticket) === null) {
    throw new GavetaError('E_AUTH_REQUIRED');
  }
}

function rejectSessionTokenInRenderQuery(request: FastifyRequest): void {
  const query = request.query as Record<string, string | string[] | undefined>;
  const sessionInQuery = query.token;
  if (sessionInQuery !== undefined) {
    throw new GavetaError('E_AUTH_REQUIRED');
  }
}
