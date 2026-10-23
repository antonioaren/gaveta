import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MERMAID_BOOT_JS,
  DEFAULT_MERMAID_MIN_JS,
  DEFAULT_THEME_CSS,
  MERMAID_BOOT_BASENAME,
  MERMAID_MIN_BASENAME,
} from '@gaveta/core';
import { GavetaError } from '@gaveta/core';

const RENDER_BRIDGE_BASENAME = 'render-bridge.js';

const STATIC_FILES: Readonly<
  Record<string, { readonly body: string; readonly contentType: string }>
> = {
  'theme.css': { body: DEFAULT_THEME_CSS, contentType: 'text/css; charset=utf-8' },
  [MERMAID_MIN_BASENAME]: {
    body: DEFAULT_MERMAID_MIN_JS,
    contentType: 'application/javascript; charset=utf-8',
  },
  [MERMAID_BOOT_BASENAME]: {
    body: DEFAULT_MERMAID_BOOT_JS,
    contentType: 'application/javascript; charset=utf-8',
  },
  [RENDER_BRIDGE_BASENAME]: {
    body: readFileSync(join(import.meta.dirname, '../assets/render-bridge.js'), 'utf8'),
    contentType: 'application/javascript; charset=utf-8',
  },
};

export function readRenderStaticFile(name: string): {
  readonly body: string;
  readonly contentType: string;
} {
  const entry = STATIC_FILES[name];
  if (entry === undefined) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return entry;
}

export function isAllowedRenderStaticName(name: string): boolean {
  return Object.hasOwn(STATIC_FILES, name);
}
