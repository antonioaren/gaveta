export type CaptureLang = 'en' | 'es';

/** Parse `--lang en|es` (default `en`). */
export function parseCaptureLang(argv: readonly string[]): CaptureLang {
  const flagIndex = argv.indexOf('--lang');
  if (flagIndex === -1) {
    return 'en';
  }
  const raw = argv[flagIndex + 1];
  if (typeof raw !== 'string' || raw.startsWith('-')) {
    throw new Error('--lang requires a value (en or es)');
  }
  const base = raw.split('-')[0].toLowerCase();
  if (base === 'en' || base === 'es') {
    return base;
  }
  throw new Error(`unsupported --lang ${raw} (use en or es)`);
}

export function playwrightLocale(lang: CaptureLang): string {
  return lang === 'es' ? 'es-ES' : 'en-US';
}
