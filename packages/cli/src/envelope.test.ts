import { expect, it } from 'vitest';
import {
  INTERNAL_ERROR_CODE,
  SCHEMA_VERSION,
  renderFailure,
  renderHumanError,
  renderHumanWarnings,
  renderSuccess,
} from './envelope.ts';

it('prints a versioned success envelope with warnings', () => {
  expect(SCHEMA_VERSION).toBe(1);
  expect(
    renderSuccess('version', { name: 'gaveta' }, [
      { code: 'W_LINK_PENDING', message: 'aviso', hint: 'pista' },
    ]),
  ).toBe(
    `${JSON.stringify(
      {
        ok: true,
        schemaVersion: 1,
        command: 'version',
        data: { name: 'gaveta' },
        warnings: [{ code: 'W_LINK_PENDING', message: 'aviso', hint: 'pista' }],
      },
      null,
      2,
    )}\n`,
  );
});

it('prints an error envelope and omits details when there are none', () => {
  const stdout = renderFailure('version', {
    code: 'E_VAULT_NOT_FOUND',
    message: 'No se ha encontrado un vault.',
    hint: 'Indica --vault.',
  });
  expect(JSON.parse(stdout)).toEqual({
    ok: false,
    schemaVersion: 1,
    command: 'version',
    error: {
      code: 'E_VAULT_NOT_FOUND',
      message: 'No se ha encontrado un vault.',
      hint: 'Indica --vault.',
    },
  });
  expect(stdout.endsWith('\n')).toBe(true);
});

it('includes error details when the failure has them', () => {
  const parsed = JSON.parse(
    renderFailure('new', {
      code: 'E_REF_AMBIGUOUS',
      message: 'ambiguo',
      hint: 'usa el id',
      details: { candidates: ['a', 'b'] },
    }),
  ) as unknown;
  expect(parsed).toEqual({
    ok: false,
    schemaVersion: 1,
    command: 'new',
    error: {
      code: 'E_REF_AMBIGUOUS',
      message: 'ambiguo',
      hint: 'usa el id',
      details: { candidates: ['a', 'b'] },
    },
  });
});

it('renders a human error with the stable code, message, hint, and problem', () => {
  expect(
    renderHumanError({
      code: 'E_ARG_INVALID',
      message: 'El argumento falta o está fuera de rango.',
      hint: 'Consulta gaveta guide para ver los valores que admite el comando.',
      details: { problem: 'El comando no existe.' },
    }),
  ).toBe(
    [
      'E_ARG_INVALID: El argumento falta o está fuera de rango.',
      'Consulta gaveta guide para ver los valores que admite el comando.',
      'El comando no existe.',
      '',
    ].join('\n'),
  );
});

it('renders human warnings from the catalog text', () => {
  expect(
    renderHumanWarnings([
      {
        code: 'W_LINK_PENDING',
        message: 'Se ha creado un enlace pendiente.',
        hint: 'Crea la nota.',
      },
    ]),
  ).toBe('W_LINK_PENDING: Se ha creado un enlace pendiente.\nCrea la nota.\n');
});

it('reserves E_INTERNAL for unexpected failures', () => {
  expect(INTERNAL_ERROR_CODE).toBe('E_INTERNAL');
});
