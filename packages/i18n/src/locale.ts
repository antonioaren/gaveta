export const LOCALES = ['en', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const GAVETA_LANG_ENV = 'GAVETA_LANG';

let activeLocale: Locale = DEFAULT_LOCALE;

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function isLocale(value: string): value is Locale {
  return value === 'en' || value === 'es';
}

/** Normalize BCP 47 tags such as `es-ES` or `en-US` to a supported locale. */
export function localeFromLanguageTag(tag: string): Locale | null {
  const normalized = tag.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }
  const primary = normalized.split(/[-_]/)[0];
  if (primary === 'es') {
    return 'es';
  }
  if (primary === 'en') {
    return 'en';
  }
  return null;
}

export function pickLocaleFromLanguageTags(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const locale = localeFromLanguageTag(tag);
    if (locale !== null) {
      return locale;
    }
  }
  return null;
}

function readUnixLocale(env: NodeJS.ProcessEnv): Locale | null {
  const candidates = [env.LC_ALL, env.LANG, env.LANGUAGE];
  for (const value of candidates) {
    if (value === undefined || value.length === 0) {
      continue;
    }
    const locale = localeFromLanguageTag(value);
    if (locale !== null) {
      return locale;
    }
  }
  return null;
}

export interface CliLocaleSources {
  readonly langFlag?: string | undefined;
  readonly env?: NodeJS.ProcessEnv;
}

/** CLI locale: --lang, GAVETA_LANG, LANG/LC_ALL, then en. */
export function resolveCliLocale(sources: CliLocaleSources): Locale {
  const flag = sources.langFlag?.trim();
  if (flag !== undefined && flag.length > 0) {
    const fromFlag = localeFromLanguageTag(flag);
    if (fromFlag !== null) {
      return fromFlag;
    }
  }
  const env = sources.env ?? process.env;
  const gavetaLang = env[GAVETA_LANG_ENV]?.trim();
  if (gavetaLang !== undefined && gavetaLang.length > 0) {
    const fromGaveta = localeFromLanguageTag(gavetaLang);
    if (fromGaveta !== null) {
      return fromGaveta;
    }
  }
  const fromUnix = readUnixLocale(env);
  if (fromUnix !== null) {
    return fromUnix;
  }
  return DEFAULT_LOCALE;
}

export const WEB_LOCALE_STORAGE_KEY = 'gaveta.locale';

export interface WebLocaleSources {
  readonly storedLocale?: string | null;
  readonly navigatorLanguage?: string | null;
}

/** Web locale: saved preference, navigator.language, then en. */
export function resolveWebLocale(sources: WebLocaleSources): Locale {
  const stored = sources.storedLocale?.trim();
  if (stored !== undefined && stored.length > 0 && isLocale(stored)) {
    return stored;
  }
  const nav = sources.navigatorLanguage?.trim();
  if (nav !== undefined && nav.length > 0) {
    const fromNav = localeFromLanguageTag(nav);
    if (fromNav !== null) {
      return fromNav;
    }
  }
  return DEFAULT_LOCALE;
}

/** Parse a weighted Accept-Language header (server). */
export function resolveLocaleFromAcceptLanguage(header: string | undefined): Locale {
  if (header === undefined || header.trim().length === 0) {
    return DEFAULT_LOCALE;
  }
  const parts = header.split(',');
  const tags: string[] = [];
  for (const part of parts) {
    const tag = part.split(';')[0]?.trim();
    if (tag !== undefined && tag.length > 0) {
      tags.push(tag);
    }
  }
  return pickLocaleFromLanguageTags(tags) ?? DEFAULT_LOCALE;
}
