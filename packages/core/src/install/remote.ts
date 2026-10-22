import { GAVETA_ALLOWED_REMOTES } from './constants.ts';

export function normalizeRemoteUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.endsWith('/')) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

export function isAllowedGavetaRemote(url: string): boolean {
  const normalized = normalizeRemoteUrl(url);
  return GAVETA_ALLOWED_REMOTES.some((allowed) => normalizeRemoteUrl(allowed) === normalized);
}
