import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

function readLabel(attrs: unknown): string {
  if (attrs === null || typeof attrs !== 'object' || !('gavetaAttrs' in attrs)) {
    return '';
  }
  const gavetaAttrs = attrs.gavetaAttrs;
  if (gavetaAttrs === null || typeof gavetaAttrs !== 'object' || !('data-label' in gavetaAttrs)) {
    return '';
  }
  const label = gavetaAttrs['data-label'];
  return typeof label === 'string' ? label : '';
}

export function GavetaKpiNodeView({ node }: NodeViewProps) {
  const label = readLabel(node.attrs);
  return (
    <NodeViewWrapper as="div" className="g-kpi visual-editor__kpi" data-label={label} role="group">
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}
