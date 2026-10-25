import { formatMessage, type MessageKey } from '@gaveta/i18n';
import { readWebLocale } from './read-web-locale.ts';

export function messageFromCaught(caught: unknown, fallbackKey: MessageKey): string {
  if (caught instanceof Error && caught.message.length > 0) {
    return caught.message;
  }
  return formatMessage(fallbackKey, readWebLocale());
}
