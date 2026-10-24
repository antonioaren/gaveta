import type { DefaultTreeAdapterMap } from 'parse5';

type ParseElement = DefaultTreeAdapterMap['element'];
type ParseText = DefaultTreeAdapterMap['textNode'];

interface ElementLocation {
  readonly startOffset?: number;
  readonly endOffset?: number;
}

export function textFromSource(
  source: string,
  node: ParseText,
  maxEnd: number | null = null,
): string | null {
  const location: unknown = node.sourceCodeLocation;
  if (location === null || typeof location !== 'object') {
    return null;
  }
  const offsets = location as ElementLocation;
  const start = offsets.startOffset;
  let end = offsets.endOffset;
  if (start === undefined || end === undefined || start > end) {
    return null;
  }
  if (maxEnd !== null && end > maxEnd) {
    end = maxEnd;
  }
  if (start > end) {
    return null;
  }
  return source.slice(start, end);
}

export function outerHtmlFromSource(source: string, element: ParseElement): string | null {
  const location: unknown = element.sourceCodeLocation;
  if (location === null || typeof location !== 'object') {
    return null;
  }
  const offsets = location as ElementLocation;
  const start = offsets.startOffset;
  const end = offsets.endOffset;
  if (start === undefined || end === undefined || start > end) {
    return null;
  }
  return source.slice(start, end);
}
