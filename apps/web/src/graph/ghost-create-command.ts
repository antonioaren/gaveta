/** Strip control characters and newlines from untrusted ghost titles. */
export function sanitizeGhostTitle(title: string): string {
  let sanitized = '';
  for (const char of title) {
    const code = char.codePointAt(0);
    if (code !== undefined && code <= 0x1f) {
      continue;
    }
    if (code === 0x7f) {
      continue;
    }
    sanitized += char;
  }
  return sanitized;
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
