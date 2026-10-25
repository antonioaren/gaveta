import { createContext } from 'react';
import type { Locale, MessageKey } from '@gaveta/i18n';

export interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
