import { GavetaError } from '@gaveta/core';
import type { FastifyRequest } from 'fastify';

export function readJsonObjectBody(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return body as Record<string, unknown>;
}

export function assertAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new GavetaError('E_ARG_INVALID');
    }
  }
}

export function requiredStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.includes('\0') || value.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value.trim();
}

/** Like `requiredStringField` but preserves leading and trailing whitespace (for note HTML). */
export function requiredNoteHtmlField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.includes('\0') || value.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (value.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

export function optionalStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return trimmed;
}

export function optionalBooleanField(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  throw new GavetaError('E_ARG_INVALID');
}

export function optionalStringListField(
  record: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const raw = optionalStringField(record, key);
  if (raw === undefined) {
    return undefined;
  }
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (new Set(parts).size !== parts.length) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return parts;
}
