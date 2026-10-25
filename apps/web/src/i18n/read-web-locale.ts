import { WEB_LOCALE_STORAGE_KEY, isLocale, resolveWebLocale, type Locale } from '@gaveta/i18n';

/** Read the active web locale from storage (browser) or default. */
export function readWebLocale(): Locale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(WEB_LOCALE_STORAGE_KEY);
  } catch {
    // private mode / disabled storage
  }
  return resolveWebLocale({
    storedLocale: stored,
    navigatorLanguage: typeof navigator === 'undefined' ? null : navigator.language,
  });
}

export function acceptLanguageHeader(locale: Locale): string {
  return locale === 'es' ? 'es,en;q=0.9' : 'en,es;q=0.9';
}

export function readAcceptLanguageHeader(): string {
  return acceptLanguageHeader(readWebLocale());
}

export function writeWebLocale(locale: Locale): void {
  if (!isLocale(locale)) {
    return;
  }
  try {
    localStorage.setItem(WEB_LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}
