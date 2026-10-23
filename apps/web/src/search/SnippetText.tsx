import { parseSnippetHighlight } from './snippet-highlight.ts';

export function SnippetText({ snippet }: { readonly snippet: string }) {
  const parts = parseSnippetHighlight(snippet);
  if (parts.length === 0) {
    return null;
  }
  return (
    <span className="palette__snippet">
      {parts.map((part, index) =>
        part.kind === 'mark' ? (
          <mark key={`m-${String(index)}`} className="palette__mark">
            {part.value}
          </mark>
        ) : (
          <span key={`t-${String(index)}`}>{part.value}</span>
        ),
      )}
    </span>
  );
}
