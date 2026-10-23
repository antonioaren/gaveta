import path from 'node:path';

export const RENDER_FILE_CSP = "default-src 'none'; sandbox";

export function contentDispositionForVaultFile(relativePath: string): string {
  const base = path.basename(relativePath.replaceAll('\\', '/'));
  const ascii = base.replace(/[^\x20-\x7E]/gu, '_');
  if (relativePath.toLowerCase().endsWith('.svg')) {
    return `attachment; filename="${ascii}"`;
  }
  return `inline; filename="${ascii}"`;
}
