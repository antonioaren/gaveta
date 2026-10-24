import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';

function readGavetaAttrs(attrs: unknown): Record<string, string> {
  if (attrs === null || typeof attrs !== 'object' || !('gavetaAttrs' in attrs)) {
    return {};
  }
  const gavetaAttrs = attrs.gavetaAttrs;
  if (gavetaAttrs === null || typeof gavetaAttrs !== 'object') {
    return {};
  }
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(gavetaAttrs)) {
    if (typeof value === 'string') {
      mapped[key] = value;
    }
  }
  return mapped;
}

export function IframeNodeView({ node }: NodeViewProps) {
  const gavetaAttrs = readGavetaAttrs(node.attrs);
  const title = gavetaAttrs.title ?? 'Marco incrustado';
  const sandbox = gavetaAttrs.sandbox ?? '';
  return (
    <NodeViewWrapper as="div" className="visual-editor__iframe-placeholder" contentEditable={false}>
      <p className="visual-editor__iframe-label">{title}</p>
      <p className="visual-editor__iframe-hint">
        Vista previa del iframe (sin ejecutar scripts). Edita el contenido en modo código.
      </p>
      {sandbox.length > 0 ? (
        <p className="visual-editor__iframe-meta">
          <code>sandbox={sandbox}</code>
        </p>
      ) : null}
    </NodeViewWrapper>
  );
}
