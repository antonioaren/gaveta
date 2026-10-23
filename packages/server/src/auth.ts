import { GavetaError } from '@gaveta/core';
import { randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { GAVETA_SERVE_HOST, GAVETA_TOKEN_HEADER } from './constants.ts';

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function readBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)\s*$/iu.exec(authorization);
  return match?.[1];
}

export function readRequestToken(headers: IncomingHttpHeaders, expected: string): boolean {
  const bearer = readBearerToken(
    typeof headers.authorization === 'string' ? headers.authorization : undefined,
  );
  const header = headers[GAVETA_TOKEN_HEADER];
  const direct = typeof header === 'string' ? header : undefined;
  const candidate = bearer ?? direct;
  return candidate === expected;
}

export function expectedHostHeader(port: number): string {
  return `${GAVETA_SERVE_HOST}:${String(port)}`;
}

export function expectedOrigin(port: number): string {
  return `http://${GAVETA_SERVE_HOST}:${String(port)}`;
}

export function assertAllowedHost(hostHeader: string | undefined, port: number): void {
  if (hostHeader === undefined) {
    throw new GavetaError('E_ORIGIN_INVALID');
  }
  const host = hostHeader.split(',')[0]?.trim();
  const allowed = expectedHostHeader(port);
  if (host !== allowed && host !== GAVETA_SERVE_HOST) {
    throw new GavetaError('E_ORIGIN_INVALID');
  }
}

export function assertAllowedOrigin(originHeader: string | undefined, port: number): void {
  if (originHeader === undefined) {
    return;
  }
  const origin = originHeader.trim();
  if (origin.length === 0) {
    throw new GavetaError('E_ORIGIN_INVALID');
  }
  if (origin !== expectedOrigin(port)) {
    throw new GavetaError('E_ORIGIN_INVALID');
  }
}

export function buildAppUrl(port: number, token: string): string {
  const base = `http://${GAVETA_SERVE_HOST}:${String(port)}/`;
  return `${base}?token=${encodeURIComponent(token)}`;
}

export function assertServeHost(host: string): void {
  if (host !== GAVETA_SERVE_HOST) {
    throw new GavetaError('E_ARG_INVALID');
  }
}
