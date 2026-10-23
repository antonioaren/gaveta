const STORAGE_KEY = 'gaveta.sessionToken';

let memoryToken: string | null = null;

export function getSessionToken(): string | null {
  if (memoryToken !== null) {
    return memoryToken;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  memoryToken = token;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // sessionStorage may be unavailable; memory copy still works for this tab.
  }
}

export function clearSessionToken(): void {
  memoryToken = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** REQ-SEC-06: bootstrap from `?token=` once, then strip it from the URL. */
export function bootstrapSessionToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('token');
  if (fromQuery !== null && fromQuery.length > 0) {
    setSessionToken(fromQuery);
    params.delete('token');
    const remainder = params.toString();
    const next = `${window.location.pathname}${remainder.length > 0 ? `?${remainder}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', next);
    return fromQuery;
  }
  const stored = getSessionToken();
  if (stored !== null) {
    memoryToken = stored;
  }
  return stored;
}
