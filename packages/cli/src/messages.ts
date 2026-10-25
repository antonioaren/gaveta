import { formatMessage, getActiveLocale, hasMessageKey, t, type MessageKey } from '@gaveta/i18n';

/** Resolve a catalog key or pass through literal text. */
export function m(text: string): string {
  if (hasMessageKey(text)) {
    return t(text, getActiveLocale());
  }
  return text;
}

/** Localized CLI human output (stdout when not using --json). */
export function hm(
  key: MessageKey,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return formatMessage(key, getActiveLocale(), params);
}

export function localizeDetails(
  details: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (details === undefined) {
    return undefined;
  }
  const problem = details.problem;
  if (typeof problem === 'string') {
    return { ...details, problem: m(problem) };
  }
  return details;
}
