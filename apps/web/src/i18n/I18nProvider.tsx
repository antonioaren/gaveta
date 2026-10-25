import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  WEB_LOCALE_STORAGE_KEY,
  formatMessage,
  resolveWebLocale,
  type Locale,
  type MessageKey,
} from '@gaveta/i18n';
import { I18nContext } from './i18n-context.ts';

function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(WEB_LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveWebLocale({
      storedLocale: readStoredLocale(),
      navigatorLanguage: typeof navigator === 'undefined' ? null : navigator.language,
    }),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(WEB_LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore private mode / disabled storage
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Readonly<Record<string, string | number>>) =>
      formatMessage(key, locale, params ?? {}),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
