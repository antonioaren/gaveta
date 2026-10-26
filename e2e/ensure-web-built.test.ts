import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, ensureWebBuilt } from './helpers.ts';

describe('ensureWebBuilt', () => {
  it('does not require a rebuild when apps/web dist is already present', () => {
    expect(existsSync(join(REPO_ROOT, 'apps/web/dist/index.html'))).toBe(true);
    ensureWebBuilt();
  });
});
