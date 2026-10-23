import type { RawData } from 'ws';

export function rawDataByteLength(raw: RawData): number {
  if (typeof raw === 'string') {
    return Buffer.byteLength(raw, 'utf8');
  }
  if (Buffer.isBuffer(raw)) {
    return raw.length;
  }
  if (Array.isArray(raw)) {
    return raw.reduce((total, chunk) => total + chunk.length, 0);
  }
  return Buffer.byteLength(raw);
}
