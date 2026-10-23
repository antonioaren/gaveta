import { expect, it } from 'vitest';
import type { DoctorFinding } from '@gaveta/core';
import { presentFinding } from './present.ts';

const SAMPLE: DoctorFinding = {
  code: 'E_LINK_BROKEN',
  message: 'Enlace roto',
  hint: 'hint',
  path: 'origen.html',
  details: { targetId: '01MISSING', href: 'x.html' },
};

it('adds severity and note id to doctor findings', () => {
  const view = presentFinding(SAMPLE, '01NOTE');
  expect(view.severity).toBe('error');
  expect(view.noteId).toBe('01NOTE');
  expect(view.code).toBe('E_LINK_BROKEN');
});

it('marks warnings with warning severity', () => {
  const view = presentFinding(
    { ...SAMPLE, code: 'W_LINK_PENDING', message: 'Pendiente', hint: 'h' },
    null,
  );
  expect(view.severity).toBe('warning');
  expect(view.noteId).toBeNull();
});
