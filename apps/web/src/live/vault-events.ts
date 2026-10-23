export type VaultNoteEventType = 'note:changed' | 'note:added' | 'note:removed' | 'note:moved';

export interface VaultNoteEvent {
  readonly type: VaultNoteEventType;
  readonly path: string;
  readonly id: string | null;
  readonly from?: string;
}

export function vaultWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ws`;
}
