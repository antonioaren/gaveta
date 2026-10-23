const CONTROL_OR_NEWLINE = /[\u0000-\u001F\u007F]/u;

/** Strip control characters and newlines from untrusted ghost titles. */
export function sanitizeGhostTitle(title: string): string {
  return title.replace(CONTROL_OR_NEWLINE, '');
}

/** POSIX single-quoted shell word: '...' with embedded quotes as '\'' */
export function posixShellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** CLI command to create a note for a ghost title (safe to paste in bash/zsh). */
export function ghostCreateCommand(title: string): string {
  const safe = sanitizeGhostTitle(title);
  const quoted = posixShellSingleQuote(safe);
  return `gaveta new --type doc -- ${quoted}`;
}
