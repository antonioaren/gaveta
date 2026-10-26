import { openSearchPanel } from '@codemirror/search';
import type { MessageKey } from '@gaveta/i18n';
import type { WebTranslate } from '../../new-note/format-api-error.ts';
import { formatNoteHtml } from '../../api/format-note.ts';
import type { PaletteCommand } from '../../search/palette-commands.ts';
import { getActiveCodeEditorHost, type ActiveCodeEditorHost } from './code-editor-host.ts';
import { openReplacePanel } from './code-editor-panels.ts';

export function codeEditorPaletteCommands(t: WebTranslate): readonly PaletteCommand[] {
  return [
    {
      id: 'code-format-document',
      label: t('web.palette.command.formatDocument'),
      keywords: ['format', 'formatear', 'documento', 'document', 'prettier', 'normalizar'],
    },
    {
      id: 'code-find',
      label: t('web.palette.command.find'),
      keywords: ['find', 'buscar', 'search'],
    },
    {
      id: 'code-replace',
      label: t('web.palette.command.replace'),
      keywords: ['replace', 'reemplazar', 'sustituir'],
    },
    {
      id: 'code-save',
      label: t('web.palette.command.saveDocument'),
      keywords: ['save', 'guardar'],
    },
  ];
}

export async function runCodeEditorPaletteCommand(commandId: string): Promise<boolean> {
  const host = getActiveCodeEditorHost();
  if (host === null) {
    return false;
  }
  switch (commandId) {
    case 'code-format-document':
      return runFormatDocument(host);
    case 'code-find':
      openSearchPanel(host.view);
      host.view.focus();
      return true;
    case 'code-replace':
      openReplacePanel(host.view);
      host.view.focus();
      return true;
    case 'code-save':
      host.onSaveRequest();
      return true;
    default:
      return false;
  }
}

async function runFormatDocument(host: ActiveCodeEditorHost): Promise<boolean> {
  const current = host.getDoc();
  const result = await formatNoteHtml(current, host.notePath);
  if (!result.ok || result.html.length === 0) {
    host.onFormatError('web.editor.code.format.failed' satisfies MessageKey);
    return false;
  }
  host.applyDoc(result.html);
  return true;
}
