import type WebSocket from 'ws';
import type { VaultNoteEvent } from './vault-events.ts';
import { wsMessageText } from './ws-message.ts';

export function createWsVaultEventInbox(socket: WebSocket): {
  waitFor(
    predicate: (event: VaultNoteEvent) => boolean,
    options?: { readonly timeoutMs?: number },
  ): Promise<VaultNoteEvent>;
} {
  const backlog: VaultNoteEvent[] = [];
  socket.on('message', (data: WebSocket.RawData) => {
    const body = JSON.parse(wsMessageText(data)) as unknown;
    if (
      typeof body === 'object' &&
      body !== null &&
      'type' in body &&
      typeof body.type === 'string' &&
      body.type.startsWith('note:')
    ) {
      backlog.push(body as VaultNoteEvent);
    }
  });

  const waitFor = (
    predicate: (event: VaultNoteEvent) => boolean,
    options?: { readonly timeoutMs?: number },
  ): Promise<VaultNoteEvent> => {
    const timeoutMs = options?.timeoutMs ?? 55_000;
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const tick = (): void => {
        const index = backlog.findIndex((event) => predicate(event));
        if (index !== -1) {
          const match = backlog[index];
          if (match === undefined) {
            return;
          }
          backlog.splice(index, 1);
          resolve(match);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error('E_WS_EVENT_TIMEOUT'));
          return;
        }
        setTimeout(tick, 10);
      };
      tick();
    });
  };

  return { waitFor };
}
