import { createHmac, timingSafeEqual } from 'node:crypto';
import { readRenderNoteId } from '@gaveta/core';

export const RENDER_TICKET_TTL_SECONDS = 60;

const TICKET_SEPARATOR = '.';

export function createRenderTicket(
  secret: string,
  noteId: string,
  nowMs: number = Date.now(),
): string {
  const id = readRenderNoteId(noteId);
  const expiresAt = Math.floor(nowMs / 1000) + RENDER_TICKET_TTL_SECONDS;
  const signature = signRenderTicket(secret, id, expiresAt);
  return `${id}${TICKET_SEPARATOR}${String(expiresAt)}${TICKET_SEPARATOR}${signature}`;
}

export function renderTicketExpiresAt(ticket: string): number | null {
  const parsed = parseRenderTicket(ticket);
  return parsed?.expiresAt ?? null;
}

export function verifyRenderTicket(
  secret: string,
  expectedNoteId: string,
  ticket: string,
  nowMs: number = Date.now(),
): boolean {
  const parsed = parseRenderTicket(ticket);
  if (parsed === null) {
    return false;
  }
  if (parsed.noteId !== readRenderNoteId(expectedNoteId)) {
    return false;
  }
  if (parsed.expiresAt * 1000 <= nowMs) {
    return false;
  }
  const expected = signRenderTicket(secret, parsed.noteId, parsed.expiresAt);
  return signaturesMatch(parsed.signature, expected);
}

export function verifyRenderTicketPayload(
  secret: string,
  ticket: string,
  nowMs: number = Date.now(),
): { noteId: string } | null {
  const parsed = parseRenderTicket(ticket);
  if (parsed === null) {
    return null;
  }
  if (parsed.expiresAt * 1000 <= nowMs) {
    return null;
  }
  const expected = signRenderTicket(secret, parsed.noteId, parsed.expiresAt);
  if (!signaturesMatch(parsed.signature, expected)) {
    return null;
  }
  return { noteId: parsed.noteId };
}

function parseRenderTicket(
  ticket: string,
): { noteId: string; expiresAt: number; signature: string } | null {
  if (typeof ticket !== 'string' || ticket.length === 0) {
    return null;
  }
  const first = ticket.indexOf(TICKET_SEPARATOR);
  const second = ticket.indexOf(TICKET_SEPARATOR, first + 1);
  if (first === -1 || second === -1) {
    return null;
  }
  const noteId = ticket.slice(0, first);
  const expiresRaw = ticket.slice(first + 1, second);
  const signature = ticket.slice(second + 1);
  if (signature.length === 0) {
    return null;
  }
  try {
    readRenderNoteId(noteId);
  } catch {
    return null;
  }
  const expiresAt = Number.parseInt(expiresRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }
  return { noteId, expiresAt, signature };
}

function signRenderTicket(secret: string, noteId: string, expiresAt: number): string {
  return createHmac('sha256', secret)
    .update(`${noteId}\n${String(expiresAt)}`)
    .digest('base64url');
}

function signaturesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
