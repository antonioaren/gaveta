import { normalizeNote } from '@gaveta/core';

const CARRIER_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHE';
const CARRIER_CREATED = '2026-10-22T12:00:00.000Z';

function bodyInnerFromNormalized(html: string): string {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return match?.[1] ?? '';
}

/**
 * Run pasted HTML through the core normalizer (same rules as CLI save) and return
 * a body fragment safe to insert into the visual editor.
 */
export function sanitizePastedHtmlFragment(fragment: string, notePath: string): string {
  const trimmed = fragment.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Fragmento</title><meta name="gaveta:id" content="${CARRIER_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="${CARRIER_CREATED}"></head><body>${trimmed}</body></html>`;
  const normalized = normalizeNote(shell, { notePath });
  if (!normalized.ok || normalized.html === null) {
    return '';
  }
  return bodyInnerFromNormalized(normalized.html).trim();
}
