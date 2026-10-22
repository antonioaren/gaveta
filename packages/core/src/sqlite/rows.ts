import { type SQLOutputValue } from 'node:sqlite';
import { GavetaError } from '../errors.ts';

export function cell(row: Record<string, SQLOutputValue>, key: string): SQLOutputValue {
  if (!Object.hasOwn(row, key)) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  const value = row[key];
  if (value === undefined) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return value;
}

export function cellText(row: Record<string, SQLOutputValue>, key: string): string {
  const value = cell(row, key);
  if (typeof value !== 'string') {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return value;
}

export function cellTextOrNull(row: Record<string, SQLOutputValue>, key: string): string | null {
  const value = cell(row, key);
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return value;
}

export function cellNumber(row: Record<string, SQLOutputValue>, key: string): number {
  const value = cell(row, key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return value;
}

export function cellNumberOrNull(row: Record<string, SQLOutputValue>, key: string): number | null {
  const value = cell(row, key);
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return value;
}
