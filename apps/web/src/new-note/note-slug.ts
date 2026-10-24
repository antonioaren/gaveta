/**
 * Slug rules shared with @gaveta/core (filenames and section ids).
 * Kept in the web package so the bundle does not import Node-only core modules.
 */

export function slugify(value: string): string {
  const lowered = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
  return lowered.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function allocateSlug(base: string, taken: ReadonlySet<string>): string {
  if (base.length === 0) {
    return '';
  }
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix.toString()}`)) {
    suffix += 1;
  }
  return `${base}-${suffix.toString()}`;
}
