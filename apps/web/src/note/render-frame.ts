import { buildRenderFrameUrl, fetchRenderTicket } from './render-ticket.ts';

/** Cache-bust query for live reloads (avoids iframe bfcache serving stale HTML). */
export function appendRenderReloadQuery(renderSrc: string, reloadGeneration: number): string {
  const separator = renderSrc.includes('?') ? '&' : '?';
  return `${renderSrc}${separator}_g=${String(reloadGeneration)}`;
}

export async function resolveRenderFrameUrl(noteId: string): Promise<string> {
  const ticket = await fetchRenderTicket(noteId);
  return buildRenderFrameUrl(ticket);
}
