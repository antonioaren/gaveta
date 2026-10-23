import { apiJson } from '../api/client.ts';

export interface RenderTicket {
  readonly id: string;
  readonly ticket: string;
  readonly expiresAt: string;
}

export interface RenderTicketResponse {
  readonly id: string;
  readonly ticket: string;
  readonly expiresAt: string;
}

/** Fetches a short-lived ticket for the sandboxed render iframe (T2.3). */
export async function fetchRenderTicket(noteId: string): Promise<RenderTicket> {
  const query = new URLSearchParams({ id: noteId });
  const envelope = await apiJson<RenderTicketResponse>(`/api/render-ticket?${query.toString()}`);
  return envelope.data;
}

export function buildRenderFrameUrl(ticket: RenderTicket): string {
  const params = new URLSearchParams({ t: ticket.ticket });
  return `/render/${encodeURIComponent(ticket.id)}?${params.toString()}`;
}
