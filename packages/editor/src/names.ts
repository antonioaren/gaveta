/** Map HTML tag names (with hyphens) to TipTap node identifiers. */
export function tagToNodeName(tag: string): string {
  return tag.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function nodeNameToTag(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
