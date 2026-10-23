import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/dist');

export function resolveWebDistRoot(): string {
  return WEB_DIST;
}

export function webDistReady(): boolean {
  return existsSync(join(WEB_DIST, 'index.html'));
}
