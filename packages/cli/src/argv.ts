const OPTIONS_WITH_VALUES = new Set([
  '--vault',
  '--from',
  '--type',
  '--tag',
  '--limit',
  '--section',
  '--due',
  '--priority',
  '--if-match',
]);

/** First positional token, skipping flags and the values of options that take one. */
export function firstPositional(args: readonly string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      continue;
    }
    if (token === '--') {
      return args[index + 1] ?? '';
    }
    if (token.startsWith('--') && token.includes('=')) {
      continue;
    }
    if (OPTIONS_WITH_VALUES.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('-')) {
      continue;
    }
    return token;
  }
  return '';
}

/**
 * `--version` and `-V` run the `version` command so they share the JSON envelope.
 * A value that happens to be the word `version` (for example `--from version`) is left alone.
 */
export function normalizeArgv(args: readonly string[]): string[] {
  const stripped: string[] = [];
  let versionFlag = false;
  for (const token of args) {
    if (token === '--version' || token === '-V') {
      versionFlag = true;
      continue;
    }
    stripped.push(token);
  }
  if (!versionFlag || firstPositional(stripped) === 'version') {
    return stripped;
  }
  return [...stripped, 'version'];
}
