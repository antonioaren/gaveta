import { buildRenderFrameUrl, fetchRenderTicket } from './render-ticket.ts';

export async function resolveRenderFrameUrl(noteId: string): Promise<string> {
  const ticket = await fetchRenderTicket(noteId);
  return buildRenderFrameUrl(ticket);
}
