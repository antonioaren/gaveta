export function parseTagsInput(raw: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const piece of raw.split(',')) {
    const tag = piece.trim();
    if (tag.length === 0 || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}
