export function offsetAtLineColumn(source: string, line: number, column: number): number {
  if (line < 1) {
    return 0;
  }
  let currentLine = 1;
  let offset = 0;
  while (currentLine < line && offset < source.length) {
    const next = source.indexOf('\n', offset);
    if (next === -1) {
      return source.length;
    }
    offset = next + 1;
    currentLine += 1;
  }
  const lineStart = offset;
  const columnIndex = Math.max(0, column - 1);
  const lineEnd = source.indexOf('\n', lineStart);
  const lineLength = lineEnd === -1 ? source.length - lineStart : lineEnd - lineStart;
  return lineStart + Math.min(columnIndex, lineLength);
}

export function lineRange(
  source: string,
  line: number,
): { readonly from: number; readonly to: number } {
  const from = offsetAtLineColumn(source, line, 1);
  const lineEnd = source.indexOf('\n', from);
  const to = lineEnd === -1 ? source.length : lineEnd;
  return { from, to };
}
