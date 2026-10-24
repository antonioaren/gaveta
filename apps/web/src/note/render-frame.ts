import { buildRenderFrameUrl, fetchRenderTicket } from './render-ticket.ts';

/** Cache-bust query for live reloads (avoids iframe bfcache serving stale HTML). */
export function appendRenderReloadQuery(renderSrc: string, reloadGeneration: number): string {
  const separator = renderSrc.includes('?') ? '&' : '?';
  return `${renderSrc}${separator}_g=${String(reloadGeneration)}`;
}

export function parseReloadGenerationFromIframeSrc(src: string): number {
  try {
    const url = new URL(src, 'http://127.0.0.1');
    const generation = url.searchParams.get('_g');
    return generation === null ? 0 : Number.parseInt(generation, 10);
  } catch {
    const match = /[?&]_g=(\d+)/.exec(src);
    const generation = match?.[1];
    return generation === undefined ? 0 : Number.parseInt(generation, 10);
  }
}

export async function resolveRenderFrameUrl(noteId: string): Promise<string> {
  const ticket = await fetchRenderTicket(noteId);
  return buildRenderFrameUrl(ticket);
}
