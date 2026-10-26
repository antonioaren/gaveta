import type { MessageKey } from '@gaveta/i18n';
import type { EditorView } from '@codemirror/view';

export interface ActiveCodeEditorHost {
  readonly notePath: string;
  readonly view: EditorView;
  readonly getDoc: () => string;
  readonly applyDoc: (html: string) => void;
  readonly onFormatError: (messageKey: MessageKey) => void;
  readonly onSaveRequest: () => void;
}

let activeHost: ActiveCodeEditorHost | null = null;
const listeners = new Set<() => void>();

function notifyHostListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeCodeEditorHost(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setActiveCodeEditorHost(host: ActiveCodeEditorHost | null): void {
  activeHost = host;
  notifyHostListeners();
}

export function getActiveCodeEditorHost(): ActiveCodeEditorHost | null {
  return activeHost;
}

export function isCodeEditorPaletteActive(): boolean {
  return activeHost !== null;
}
