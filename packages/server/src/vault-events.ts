import { EventEmitter } from 'node:events';

export type VaultNoteEventType = 'note:changed' | 'note:added' | 'note:removed' | 'note:moved';

import type { LivePipelineTracePayload } from './live-pipeline-trace.ts';

export interface VaultNoteEvent {
  readonly type: VaultNoteEventType;
  readonly path: string;
  readonly id: string | null;
  readonly from?: string;
  /** Present when the server traced a vault write through to WebSocket emit. */
  readonly pipeline?: LivePipelineTracePayload;
}

export class VaultEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(64);
  }
  emitNote(event: VaultNoteEvent): void {
    this.emit('note', event);
  }

  onNote(listener: (event: VaultNoteEvent) => void): () => void {
    this.on('note', listener);
    return () => {
      this.off('note', listener);
    };
  }
}
