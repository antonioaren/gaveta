/** Split a `gaveta …` example into argv tokens (without the leading `gaveta`). */
export function tokensFromGavetaExample(example: string): string[] {
  const trimmed = example.startsWith('gaveta ') ? example.slice('gaveta '.length) : example;
  return tokenizeShellLine(trimmed);
}

/** Tokenize a single shell-like command line (no leading program name). */
export function tokenizeShellLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const char of line) {
    if (quote !== null) {
      if (char === quote) {
        quote = null;
        tokens.push(current);
        current = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ' ') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}
