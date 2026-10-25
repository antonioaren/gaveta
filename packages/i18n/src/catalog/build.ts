import cliHumanEn from './cli.human.en.json' with { type: 'json' };
import cliHumanEs from './cli.human.es.json' with { type: 'json' };
import cliEn from './cli.en.auto.json' with { type: 'json' };
import cliEs from './cli.es.auto.json' with { type: 'json' };
import { diagnosticMessagesEn, diagnosticMessagesEs } from './diagnostics.ts';
import serverEn from './server.en.json' with { type: 'json' };
import serverEs from './server.es.json' with { type: 'json' };
import { webMessagesEn, webMessagesEs } from './web.ts';

export type MessageKey =
  | keyof typeof diagnosticMessagesEn
  | keyof typeof cliEs
  | keyof typeof cliHumanEs
  | keyof typeof serverEs
  | keyof typeof webMessagesEs;

export type MessageCatalog = Record<MessageKey, string>;

function mergeCatalog(parts: readonly Record<string, string>[]): MessageCatalog {
  const out: Record<string, string> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (Object.hasOwn(out, key)) {
        throw new Error(`Duplicate message key: ${key}`);
      }
      out[key] = value;
    }
  }
  return out as MessageCatalog;
}

export const catalogs: Record<'en' | 'es', MessageCatalog> = {
  en: mergeCatalog([diagnosticMessagesEn, cliEn, cliHumanEn, serverEn, webMessagesEn]),
  es: mergeCatalog([diagnosticMessagesEs, cliEs, cliHumanEs, serverEs, webMessagesEs]),
};

export function assertCatalogParity(): void {
  const enKeys = Object.keys(catalogs.en).sort();
  const esKeys = Object.keys(catalogs.es).sort();
  if (enKeys.length !== esKeys.length) {
    throw new Error(
      `Catalog key count mismatch: en=${String(enKeys.length)} es=${String(esKeys.length)}`,
    );
  }
  for (let i = 0; i < enKeys.length; i += 1) {
    if (enKeys[i] !== esKeys[i]) {
      throw new Error(
        `Catalog key mismatch at ${String(i)}: ${enKeys[i] ?? '?'} vs ${esKeys[i] ?? '?'}`,
      );
    }
  }
}
