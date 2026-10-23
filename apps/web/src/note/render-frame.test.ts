import { expect, it } from 'vitest';
import { appendRenderReloadQuery } from './render-frame.ts';

it('appendRenderReloadQuery adds a generation query param', () => {
  expect(appendRenderReloadQuery('/render/01NOTE?t=abc', 3)).toBe('/render/01NOTE?t=abc&_g=3');
  expect(appendRenderReloadQuery('/render/01NOTE', 1)).toBe('/render/01NOTE?_g=1');
});
