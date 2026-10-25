import { describe, expect, it } from 'vitest';
import { assertCatalogParity, catalogs } from './build.ts';

describe('message catalogs', () => {
  it('have identical keys in en and es', () => {
    expect(() => {
      assertCatalogParity();
    }).not.toThrow();
    expect(Object.keys(catalogs.en).length).toBeGreaterThan(200);
    expect(Object.keys(catalogs.es)).toEqual(Object.keys(catalogs.en));
  });
});
