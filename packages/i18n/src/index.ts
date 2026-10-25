export {
  DEFAULT_LOCALE,
  GAVETA_LANG_ENV,
  LOCALES,
  WEB_LOCALE_STORAGE_KEY,
  getActiveLocale,
  isLocale,
  localeFromLanguageTag,
  pickLocaleFromLanguageTags,
  resolveCliLocale,
  resolveLocaleFromAcceptLanguage,
  resolveWebLocale,
  setActiveLocale,
  type CliLocaleSources,
  type Locale,
  type WebLocaleSources,
} from './locale.ts';

export { fillTemplate } from './format.ts';
export { formatMessage, hasMessageKey, t } from './messages.ts';
export { assertCatalogParity, catalogs, type MessageKey } from './catalog/build.ts';
export type { DiagnosticCode, DiagnosticMessageKey } from './catalog/diagnostics.ts';
