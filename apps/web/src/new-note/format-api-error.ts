import type { MessageKey } from '@gaveta/i18n';
import { ApiError } from '../api/client.ts';
import { formatMessage } from '@gaveta/i18n';
import { readWebLocale } from '../i18n/read-web-locale.ts';

const CODE_KEYS: Readonly<Record<string, MessageKey>> = {
  E_ARG_INVALID: 'web.api.error.E_ARG_INVALID',
  E_PATH_EXISTS: 'web.api.error.E_PATH_EXISTS',
  E_ID_DUPLICATE: 'web.api.error.E_ID_DUPLICATE',
  E_HTML_INVALID: 'web.api.error.E_HTML_INVALID',
  E_IF_MATCH_REQUIRED: 'web.api.error.E_IF_MATCH_REQUIRED',
  E_CONFLICT: 'web.api.error.E_CONFLICT',
  E_AUTH_REQUIRED: 'web.api.error.E_AUTH_REQUIRED',
};

export type WebTranslate = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

export function formatApiError(caught: unknown, t?: WebTranslate): string {
  const translate =
    t ??
    ((key: MessageKey, params?: Readonly<Record<string, string | number>>) =>
      formatMessage(key, readWebLocale(), params ?? {}));
  const genericApi = translate('web.api.error.fallbackGeneric');
  if (caught instanceof ApiError) {
    if (caught.message.length > 0 && caught.message !== genericApi) {
      return caught.message;
    }
    const key = CODE_KEYS[caught.code];
    if (key !== undefined) {
      return translate(key);
    }
    return translate('web.api.error.fallbackCode', { code: caught.code });
  }
  if (caught instanceof Error && caught.message.length > 0) {
    return caught.message;
  }
  return translate('web.api.error.fallbackCreate');
}
