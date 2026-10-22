import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Default vault stylesheet. `gaveta init` copies this text to `.gaveta/theme.css`.
 * A note links it with a relative href and renders with no server and no JavaScript.
 */
export const DEFAULT_THEME_CSS = readFileSync(join(import.meta.dirname, 'theme.css'), 'utf8');
