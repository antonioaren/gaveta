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

export function TaskInputNodeView({ node, updateAttributes }: NodeViewProps) {
  const gavetaAttrs = readGavetaAttrs(node.attrs);
  const checked = gavetaAttrs.checked === '' || gavetaAttrs.checked === 'checked';
  return (
    <NodeViewWrapper as="span" className="visual-editor__task-input">
      <input
        type="checkbox"
        checked={checked}
        aria-label="Tarea"
        onChange={(event) => {
          const next = { ...gavetaAttrs };
          if (event.target.checked) {
            next.checked = 'checked';
          } else {
            delete next.checked;
          }
          updateAttributes({ gavetaAttrs: next, gavetaDirty: true, gavetaOuter: null });
        }}
      />
    </NodeViewWrapper>
  );
}
