/** Interpolate `{name}` placeholders in a catalog string. */
export function fillTemplate(
  template: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{([A-Za-z0-9]+)\}/g, (match: string, key: string): string => {
    if (!Object.hasOwn(params, key)) {
      return match;
    }
    const value = params[key];
    if (value === undefined) {
      return match;
    }
    return String(value);
  });
}
