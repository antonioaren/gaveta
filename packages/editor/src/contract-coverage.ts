import { BODY_ELEMENTS, classifyElement } from '@gaveta/core';
import { HTML_BLOCK_NODE } from './html-block.ts';
import { mappedContractTags } from './schema.ts';

export function contractElementsMissingFromSchema(): string[] {
  const mapped = mappedContractTags();
  const missing: string[] = [];
  for (const entry of BODY_ELEMENTS) {
    if (!mapped.has(entry.name)) {
      missing.push(entry.name);
    }
  }
  return missing;
}

export function isRoutedToHtmlBlock(tag: string): boolean {
  return classifyElement(tag) === 'unknown';
}

export function schemaRegistrySummary(): {
  mapped: readonly string[];
  htmlBlock: string;
} {
  const mapped = mappedContractTags();
  const tags = [...mapped.keys()].filter((tag) => tag !== 'doc' && tag !== HTML_BLOCK_NODE);
  return {
    mapped: tags.sort(),
    htmlBlock: HTML_BLOCK_NODE,
  };
}
