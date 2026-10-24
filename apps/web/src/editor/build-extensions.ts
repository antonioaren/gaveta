import type { AnyExtension, Extensions } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  GavetaDirtyExtension,
  HTML_BLOCK_NODE,
  gavetaExtensions,
  parseBodyHtmlToDocJson,
  tagToNodeName,
} from '@gaveta/editor';
import { sanitizePasteViaApi } from './paste-api.ts';
import { GavetaKpiNodeView } from './node-views/GavetaKpiNodeView.tsx';
import { HtmlBlockNodeView } from './node-views/HtmlBlockNodeView.tsx';
import { IframeNodeView } from './node-views/IframeNodeView.tsx';
import { TaskInputNodeView } from './node-views/TaskInputNodeView.tsx';

function buildPasteExtension(notePath: string): Extension {
  return Extension.create({
    name: 'gavetaPasteSanitizer',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('gavetaPasteSanitizer'),
          props: {
            handlePaste(view, event) {
              const clipboard = event.clipboardData;
              if (clipboard === null) {
                return false;
              }
              const html = clipboard.getData('text/html');
              const plain = clipboard.getData('text/plain');
              const source = html.trim().length > 0 ? html : plain;
              if (source.trim().length === 0) {
                return false;
              }
              event.preventDefault();
              const insertFragment = (fragment: string): void => {
                if (fragment.length === 0) {
                  return;
                }
                const docJson = parseBodyHtmlToDocJson(fragment);
                const node = view.state.schema.nodeFromJSON(docJson);
                const slice = new Slice(node.content, 0, 0);
                view.dispatch(view.state.tr.replaceSelection(slice));
              };
              if (html.trim().length === 0) {
                const escaped = plain
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;');
                insertFragment(`<p>${escaped}</p>`);
                return true;
              }
              void sanitizePasteViaApi(source, notePath).then(insertFragment);
              return true;
            },
          },
        }),
      ];
    },
  });
}

function withNodeView(
  extension: AnyExtension,
  nodeView: ReturnType<typeof ReactNodeViewRenderer>,
): AnyExtension {
  return extension.extend({
    addNodeView() {
      return nodeView;
    },
  });
}

export function buildVisualEditorExtensions(notePath: string): Extensions {
  const mapped: AnyExtension[] = gavetaExtensions.map((extension) => {
    const name = extension.name;
    if (name === HTML_BLOCK_NODE) {
      return withNodeView(extension, ReactNodeViewRenderer(HtmlBlockNodeView));
    }
    if (name === tagToNodeName('gaveta-kpi')) {
      return withNodeView(extension, ReactNodeViewRenderer(GavetaKpiNodeView));
    }
    if (name === tagToNodeName('iframe')) {
      return withNodeView(extension, ReactNodeViewRenderer(IframeNodeView));
    }
    if (name === tagToNodeName('input')) {
      return withNodeView(extension, ReactNodeViewRenderer(TaskInputNodeView));
    }
    return extension;
  });
  return [...mapped, GavetaDirtyExtension, buildPasteExtension(notePath)];
}
