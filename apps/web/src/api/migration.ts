import { formatMessage } from '@gaveta/i18n';
import { apiFetch, apiJson } from './client.ts';
import { readWebLocale } from '../i18n/read-web-locale.ts';
import type { ExportPreviewData, ImportPreviewData } from './migration-types.ts';
import { bytesToBase64 } from '../migration/base64.ts';

export async function createImportStaging(): Promise<string> {
  const envelope = await apiJson<{ stagingId: string }>('/api/import/staging', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  return envelope.data.stagingId;
}

export async function uploadImportStagingFile(
  stagingId: string,
  relativePath: string,
  bytes: Uint8Array,
): Promise<void> {
  await apiJson<{ ok: boolean }>('/api/import/staging/file', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stagingId,
      relativePath,
      contentBase64: bytesToBase64(bytes),
    }),
  });
}

export interface ImportRunOptions {
  readonly in?: string;
  readonly onConflict?: 'skip' | 'rename' | 'overwrite';
  readonly continueOnError?: boolean;
  readonly rootName?: string;
}

export async function previewImport(
  stagingId: string,
  options: ImportRunOptions = {},
): Promise<ImportPreviewData> {
  const envelope = await apiJson<ImportPreviewData>('/api/import/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stagingId, ...options }),
  });
  return envelope.data;
}

export async function commitImport(
  stagingId: string,
  options: ImportRunOptions = {},
): Promise<ImportPreviewData> {
  const envelope = await apiJson<ImportPreviewData>('/api/import/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stagingId, ...options }),
  });
  return envelope.data;
}

export interface ExportScope {
  readonly ref?: string;
  readonly all?: boolean;
  readonly links?: 'wiki' | 'relative';
}

export async function previewExport(scope: ExportScope): Promise<ExportPreviewData> {
  const envelope = await apiJson<ExportPreviewData>('/api/export/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(scope),
  });
  return envelope.data;
}

export async function downloadExportZip(scope: ExportScope, filename: string): Promise<void> {
  const response = await apiFetch('/api/export/download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(scope),
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    throw new Error(
      body.error?.message ?? formatMessage('web.api.error.fallbackExport', readWebLocale()),
    );
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}
