import { expect, it } from 'vitest';
import { healthCodeTone } from './health-code-tone.ts';

it('maps known doctor codes to theme tones', () => {
  expect(healthCodeTone('E_LINK_BROKEN', 'error')).toBe('danger');
  expect(healthCodeTone('W_LINK_PENDING', 'warning')).toBe('pending');
});

it('falls back to severity when the code is unknown', () => {
  expect(healthCodeTone('E_TASK_INVALID', 'error')).toBe('danger');
  expect(healthCodeTone('W_REL_UNKNOWN', 'warning')).toBe('warn');
});
