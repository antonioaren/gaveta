const MAX_ENTRIES = 200;

export function pushLiveE2eLog(entry: Record<string, unknown>): void {
  const global = globalThis as { __gavetaLiveLog?: { at: number; kind: string }[] };
  const log = global.__gavetaLiveLog;
  if (!Array.isArray(log)) {
    return;
  }
  const kind = typeof entry.kind === 'string' ? entry.kind : 'event';
  log.push({ at: performance.now(), kind, ...entry });
  if (log.length > MAX_ENTRIES) {
    log.splice(0, log.length - MAX_ENTRIES);
  }
}
