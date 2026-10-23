import { GavetaError } from '@gaveta/core';
import { expect, it } from 'vitest';
import { readGraphFilters } from './query.ts';

it('reads folder filter for global graph', () => {
  expect(readGraphFilters({ folder: 'enlaces' })).toEqual({ folder: 'enlaces' });
});

it('rejects empty folder', () => {
  expect(() => readGraphFilters({ folder: '  ' })).toThrow(GavetaError);
});

it('rejects leading slash in folder', () => {
  expect(() => readGraphFilters({ folder: '/enlaces' })).toThrow(GavetaError);
});
