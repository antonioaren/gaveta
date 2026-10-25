import { formatMessage, type Locale, type MessageKey } from '@gaveta/i18n';

/** CodeMirror `EditorState.phrases` keys (English) mapped to Gaveta message ids. */
const CM_PHRASE_TO_MESSAGE: Readonly<Record<string, MessageKey>> = {
  Find: 'web.editor.code.cm.find',
  Replace: 'web.editor.code.cm.replace',
  next: 'web.editor.code.cm.next',
  previous: 'web.editor.code.cm.previous',
  all: 'web.editor.code.cm.all',
  'match case': 'web.editor.code.cm.matchCase',
  regexp: 'web.editor.code.cm.regexp',
  'by word': 'web.editor.code.cm.byWord',
  replace: 'web.editor.code.cm.replaceVerb',
  'replace all': 'web.editor.code.cm.replaceAll',
  close: 'web.editor.code.cm.close',
  'Folded lines': 'web.editor.code.cm.foldedLines',
  'Unfolded lines': 'web.editor.code.cm.unfoldedLines',
  to: 'web.editor.code.cm.to',
  'folded code': 'web.editor.code.cm.foldedCode',
  unfold: 'web.editor.code.cm.unfold',
  'Fold line': 'web.editor.code.cm.foldLine',
  'Unfold line': 'web.editor.code.cm.unfoldLine',
};

export function codeMirrorPhrasesForLocale(locale: Locale): Record<string, string> {
  const phrases: Record<string, string> = {};
  for (const [cmKey, messageKey] of Object.entries(CM_PHRASE_TO_MESSAGE)) {
    phrases[cmKey] = formatMessage(messageKey, locale);
  }
  return phrases;
}
