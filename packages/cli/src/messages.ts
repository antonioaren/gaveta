import { getActiveLocale, hasMessageKey, t } from '@gaveta/i18n';

/** Resolve a catalog key or pass through literal text. */
export function m(text: string): string {
  if (hasMessageKey(text)) {
    return t(text, getActiveLocale());
  }
  return text;
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
