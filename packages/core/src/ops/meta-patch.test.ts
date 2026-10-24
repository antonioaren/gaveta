import { expect, it } from 'vitest';
import { patchOptionalMeta } from './meta-patch.ts';

const SHELL = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>T</title><meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"><meta name="gaveta:tags" content="vieja"></head><body><article><h1>T</h1></article></body></html>`;

it('updates tags and clears aliases', () => {
  const next = patchOptionalMeta(SHELL, ['nueva', 'otra'], []);
  expect(next).toContain('name="gaveta:tags" content="nueva, otra"');
  expect(next).not.toContain('gaveta:aliases');
});

it('leaves html unchanged when fields are undefined', () => {
  expect(patchOptionalMeta(SHELL, undefined, undefined)).toBe(SHELL);
});
