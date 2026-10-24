import type { RenderTicket } from './render-ticket.ts';

const REFRESH_BEFORE_EXPIRY_MS = 30_000;

interface CachedTicket {
  readonly ticket: RenderTicket;
  readonly expiresAtMs: number;
}

const cache = new Map<string, CachedTicket>();

function expiresAtMs(ticket: RenderTicket): number {
  const parsed = Date.parse(ticket.expiresAt);
  return Number.isFinite(parsed) ? parsed : Date.now() + 600_000;
}

export function getCachedRenderTicket(noteId: string): RenderTicket | null {
  const entry = cache.get(noteId);
  if (entry === undefined) {
    return null;
  }
  if (entry.expiresAtMs - Date.now() < REFRESH_BEFORE_EXPIRY_MS) {
    cache.delete(noteId);
    return null;
  }
  return entry.ticket;
}

export function setCachedRenderTicket(noteId: string, ticket: RenderTicket): void {
  cache.set(noteId, { ticket, expiresAtMs: expiresAtMs(ticket) });
}

/** Test-only reset. */
export function resetRenderTicketCacheForTests(): void {
  cache.clear();
}
