import { expect, it } from 'vitest';
import {
  RENDER_TICKET_TTL_SECONDS,
  createRenderTicket,
  renderTicketExpiresAt,
  verifyRenderTicket,
} from './render-ticket.ts';

const SECRET = 'render-ticket-test-secret-value!!';
const NOTE_ID = '01M5HGV8800000000000000011';

it('creates a ticket that verifies for the same note id', () => {
  const now = 1_700_000_000_000;
  const ticket = createRenderTicket(SECRET, NOTE_ID, now);
  expect(verifyRenderTicket(SECRET, NOTE_ID, ticket, now)).toBe(true);
  expect(renderTicketExpiresAt(ticket)).toBe(Math.floor(now / 1000) + RENDER_TICKET_TTL_SECONDS);
});

it('rejects an expired ticket', () => {
  const issued = 1_700_000_000_000;
  const ticket = createRenderTicket(SECRET, NOTE_ID, issued);
  const later = issued + (RENDER_TICKET_TTL_SECONDS + 1) * 1000;
  expect(verifyRenderTicket(SECRET, NOTE_ID, ticket, later)).toBe(false);
});

it('rejects a ticket when the note id does not match', () => {
  const now = 1_700_000_000_000;
  const ticket = createRenderTicket(SECRET, NOTE_ID, now);
  expect(verifyRenderTicket(SECRET, '01M5HGV8800000000000000012', ticket, now)).toBe(false);
});

it('rejects a tampered ticket signature in constant time shape', () => {
  const now = 1_700_000_000_000;
  const ticket = createRenderTicket(SECRET, NOTE_ID, now);
  const parts = ticket.split('.');
  expect(parts.length).toBe(3);
  const notePart = parts[0] ?? '';
  const expPart = parts[1] ?? '';
  const forged = `${notePart}.${expPart}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  expect(verifyRenderTicket(SECRET, NOTE_ID, forged, now)).toBe(false);
});
