import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useI18n } from '../../i18n/useI18n.ts';

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
  const { t } = useI18n();
  const gavetaAttrs = readGavetaAttrs(node.attrs);
  const title = gavetaAttrs.title ?? t('web.editor.iframe.defaultTitle');
  const sandbox = gavetaAttrs.sandbox ?? '';
  return (
    <NodeViewWrapper as="div" className="visual-editor__iframe-placeholder" contentEditable={false}>
      <p className="visual-editor__iframe-label">{title}</p>
      <p className="visual-editor__iframe-hint">{t('web.editor.iframe.hint')}</p>
      {sandbox.length > 0 ? (
        <p className="visual-editor__iframe-meta">
          <code>sandbox={sandbox}</code>
        </p>
      ) : null}
    </NodeViewWrapper>
  );
}
