import { slugify } from '@gaveta/core';

/** Stable ASCII MCP property name for a CLI positional (slugify strips accents). */
export function mcpArgKey(cliArgName: string): string {
  return slugify(cliArgName);
}
