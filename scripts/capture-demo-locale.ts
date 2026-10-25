export type CaptureLang = 'en' | 'es';

export interface CaptureUiStrings {
  readonly explorerNav: string;
  readonly globalGraphHeading: string;
  readonly notesButton: string;
}

export const UI_BY_LANG: Record<CaptureLang, CaptureUiStrings> = {
  en: {
    explorerNav: 'Note explorer',
    globalGraphHeading: 'Global graph',
    notesButton: 'Notes',
  },
  es: {
    explorerNav: 'Explorador de notas',
    globalGraphHeading: 'Grafo global',
    notesButton: 'Notas',
  },
};

/** Parse `--lang en|es` (default `en`). Use `es` until the web UI i18n PR ships. */
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
