import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WRITE_API_ROUTES = [
  '/api/new',
  '/api/edit',
  '/api/link',
  '/api/mv',
  '/api/rm',
  '/api/todo/add',
  '/api/todo/check',
  '/api/todo/uncheck',
  '/api/folder/mkdir',
  '/api/folder/mv',
  '/api/folder/rm',
  '/api/meta',
  '/api/mentions/link',
] as const;

describe('T3.13 write API parity coverage', () => {
  it('documents a parity test for each CRUD write route', () => {
    const source = readFileSync(join(import.meta.dirname, 'write-api.parity.test.ts'), 'utf8');
    for (const route of WRITE_API_ROUTES) {
      expect(source.includes(route), `missing parity coverage for ${route}`).toBe(true);
    }
  });
});
