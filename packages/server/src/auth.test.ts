import { expect, it } from 'vitest';
import {
  assertAllowedHost,
  assertSingleHostHeader,
  readRequestToken,
  tokensMatch,
} from './auth.ts';
import { GAVETA_SERVE_DEFAULT_PORT, GAVETA_SERVE_HOST, GAVETA_TOKEN_HEADER } from './constants.ts';

const port = GAVETA_SERVE_DEFAULT_PORT;

it('compares session tokens in constant time', () => {
  const secret = 'a'.repeat(43);
  expect(tokensMatch(secret, secret)).toBe(true);
  expect(tokensMatch(`${secret}x`, secret)).toBe(false);
  expect(tokensMatch(secret, `${secret}x`)).toBe(false);
  expect(tokensMatch(undefined, secret)).toBe(false);
});

it('readRequestToken uses constant-time comparison', () => {
  const expected = 'session-token-value-32-chars-min!!';
  expect(readRequestToken({ [GAVETA_TOKEN_HEADER]: expected }, expected)).toBe(true);
  expect(readRequestToken({ [GAVETA_TOKEN_HEADER]: `${expected}wrong` }, expected)).toBe(false);
});

it('rejects a Host header containing a comma', () => {
  expect(() => {
    assertAllowedHost(`${GAVETA_SERVE_HOST}:${String(port)}, evil.example`, port);
  }).toThrow();
});

it('rejects duplicate Host header values', () => {
  expect(() => {
    assertSingleHostHeader([
      'Host',
      `${GAVETA_SERVE_HOST}:${String(port)}`,
      'Host',
      GAVETA_SERVE_HOST,
    ]);
  }).toThrow();
});

it('rejects localhost as Host (only 127.0.0.1 is allowed)', () => {
  expect(() => {
    assertAllowedHost(`localhost:${String(port)}`, port);
  }).toThrow();
});

it('accepts the bound 127.0.0.1 Host with port', () => {
  assertAllowedHost(`${GAVETA_SERVE_HOST}:${String(port)}`, port);
});
