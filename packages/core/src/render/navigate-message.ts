/** postMessage payload emitted by `/render/static/render-bridge.js` for wiki navigation. */
export const GAVETA_NAVIGATE_MESSAGE_TYPE = 'gaveta:navigate';

export interface GavetaNavigateMessage {
  readonly type: typeof GAVETA_NAVIGATE_MESSAGE_TYPE;
  readonly ref: string;
}

/**
 * Validates a `message` event payload from the render iframe.
 * The parent MUST also verify `event.source === iframe.contentWindow` before acting.
 */
export function parseGavetaNavigateMessage(data: unknown): GavetaNavigateMessage | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (record.type !== GAVETA_NAVIGATE_MESSAGE_TYPE) {
    return null;
  }
  const ref = record.ref;
  if (typeof ref !== 'string') {
    return null;
  }
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return { type: GAVETA_NAVIGATE_MESSAGE_TYPE, ref: trimmed };
}
