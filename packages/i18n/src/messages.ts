import type { Locale } from './locale.ts';
import { fillTemplate } from './format.ts';
import { catalogs, type MessageKey } from './catalog/build.ts';

export function hasMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(catalogs.en, key);
}

export function formatMessage(
  key: MessageKey,
  locale: Locale,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const table = catalogs[locale];
  const template = table[key];
  return fillTemplate(template, params);
}

/** Shorthand for the active locale (Node) or an explicit locale (web). */
export function t(
  key: MessageKey,
  locale: Locale,
  params?: Readonly<Record<string, string | number>>,
): string {
  return formatMessage(key, locale, params ?? {});
}
