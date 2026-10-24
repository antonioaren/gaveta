import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';

function readHtml(attrs: unknown): string {
  if (attrs === null || typeof attrs !== 'object' || !('html' in attrs)) {
    return '';
  }
  const html = attrs.html;
  return typeof html === 'string' ? html : '';
}

export function HtmlBlockNodeView({ node }: NodeViewProps) {
  const html = readHtml(node.attrs);
  return (
    <NodeViewWrapper
      as="div"
      className="visual-editor__html-block"
      data-gaveta-html-block="1"
      contentEditable={false}
    >
      <p className="visual-editor__html-block-label">
        Bloque HTML (solo lectura en el editor visual)
      </p>
      <pre className="visual-editor__html-block-code">{html}</pre>
    </NodeViewWrapper>
  );
}
