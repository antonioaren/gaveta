export interface GavetaNavigateMessage {
  readonly type: 'gaveta:navigate';
  readonly ref: string;
}

export function isGavetaNavigateMessage(data: unknown): data is GavetaNavigateMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    record.type === 'gaveta:navigate' && typeof record.ref === 'string' && record.ref.length > 0
  );
}
