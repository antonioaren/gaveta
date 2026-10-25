import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { useI18n } from '../../i18n/useI18n.ts';

function readHtml(attrs: unknown): string {
  if (attrs === null || typeof attrs !== 'object' || !('html' in attrs)) {
    return '';
  }
  const html = attrs.html;
  return typeof html === 'string' ? html : '';
}

export function HtmlBlockNodeView({ node }: NodeViewProps) {
  const { t } = useI18n();
  const html = readHtml(node.attrs);
  return (
    <NodeViewWrapper
      as="div"
      className="visual-editor__html-block"
      data-gaveta-html-block="1"
      contentEditable={false}
    >
      <p className="visual-editor__html-block-label">{t('web.editor.htmlBlock.label')}</p>
      <pre className="visual-editor__html-block-code">{html}</pre>
    </NodeViewWrapper>
  );
}
