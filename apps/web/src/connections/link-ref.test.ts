import { expect, it } from 'vitest';
import { viewerRefForBacklink, viewerRefForOutgoing } from './link-ref.ts';

it('uses ULID refs for outgoing and backlink navigation', () => {
  expect(
    viewerRefForOutgoing({
      target: {
        id: '01M5HGV8800000000000000003',
        path: 'formas-de-enlace.html',
        title: 'Formas',
        ghost: false,
      },
      rel: null,
      text: 'x',
      section: null,
    }),
  ).toBe('01M5HGV8800000000000000003');

  expect(
    viewerRefForBacklink({
      sourcePath: 'formas-de-enlace.html',
      sourceId: '01M5HGV8800000000000000003',
      sourceTitle: 'Formas',
      rel: null,
      text: 'x',
      section: null,
      context: 'ctx',
    }),
  ).toBe('01M5HGV8800000000000000003');
});
