import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

function hasPreservedOuter(attrs: Record<string, unknown>): boolean {
  return typeof attrs.gavetaOuter === 'string';
}

function collectChangedRanges(
  transactions: readonly {
    docChanged: boolean;
    steps: readonly {
      getMap: () => { forEach: (fn: (a: number, b: number, c: number, d: number) => void) => void };
    }[];
  }[],
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  for (const transaction of transactions) {
    if (!transaction.docChanged) {
      continue;
    }
    for (const step of transaction.steps) {
      step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        ranges.push({ from: newStart, to: newEnd });
      });
    }
  }
  return ranges;
}

function rangeTouchesNode(
  nodePos: number,
  nodeSize: number,
  ranges: readonly { from: number; to: number }[],
): boolean {
  const end = nodePos + nodeSize;
  return ranges.some((range) => range.from < end && range.to > nodePos);
}

export const GavetaDirtyPluginKey = new PluginKey('gavetaDirty');

export const GavetaDirtyExtension = Extension.create({
  name: 'gavetaDirty',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: GavetaDirtyPluginKey,
        appendTransaction(transactions, _oldState, newState) {
          const userChanged = transactions.some(
            (transaction) => transaction.docChanged && transaction.getMeta('addToHistory') === true,
          );
          if (!userChanged) {
            return null;
          }
          const ranges = collectChangedRanges(transactions);
          if (ranges.length === 0) {
            return null;
          }
          const tr = newState.tr;
          newState.doc.descendants((node, pos) => {
            if (!hasPreservedOuter(node.attrs)) {
              return;
            }
            if (!rangeTouchesNode(pos, node.nodeSize, ranges)) {
              return;
            }
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              gavetaDirty: true,
              gavetaOuter: null,
            });
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
