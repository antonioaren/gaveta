/**
 * Provisional copy of the 2026-10-22 filename slug rule.
 * `@gaveta/core` owns this once T1.4 lands; fixture names stay on this copy until then.
 * Collision suffixes (`-2`, `-3`) are applied by the caller, not here.
 */
export function slugify(title: string): string {
  const stripped = title.normalize('NFD').replace(/\p{M}/gu, '');
  const hyphenated = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '');
  if (hyphenated === '') {
    throw new Error('title has no slug characters');
  }
  return hyphenated;
}
