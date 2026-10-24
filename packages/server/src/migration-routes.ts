import {
  exportVaultToMarkdown,
  GavetaError,
  importMarkdownFolder,
  type ImportMarkdownFolderOptions,
  type ImportOnConflict,
} from '@gaveta/core';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { apiSuccess } from './envelope.ts';
import { API_IMPORT_FILE_BODY_LIMIT_BYTES, GAVETA_TOKEN_HEADER } from './constants.ts';
import {
  assertAllowedKeys,
  optionalBooleanField,
  optionalStringField,
  optionalStringListField,
  readJsonObjectBody,
  requiredStringField,
} from './write-body.ts';
import { buildExportApiData, buildImportApiData } from './migration/migration-report.ts';
import {
  createImportStagingSession,
  disposeImportStagingSession,
  resolveImportStagingSource,
  writeImportStagingFile,
} from './migration/import-staging.ts';
import { createZipBuffer } from './migration/zip-buffer.ts';

export interface MigrationRoutesOptions {
  readonly vaultRoot: string;
  readonly sessionToken: string;
}

function readOnConflict(body: Record<string, unknown>): ImportOnConflict {
  const value = optionalStringField(body, 'onConflict');
  if (value === undefined || value === 'skip') {
    return 'skip';
  }
  if (value === 'rename' || value === 'overwrite') {
    return value;
  }
  throw new GavetaError('E_ARG_INVALID');
}

async function collectFilesRecursive(
  root: string,
  prefix = '',
): Promise<{ path: string; data: Buffer }[]> {
  const dir = prefix.length === 0 ? root : path.join(root, prefix);
  const entries = await readdir(dir, { withFileTypes: true });
  const files: { path: string; data: Buffer }[] = [];
  for (const entry of entries) {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    const absolute = path.join(root, relative);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesRecursive(root, relative)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const data = await readFile(absolute);
    files.push({ path: relative.replace(/\\/g, '/'), data });
  }
  return files;
}

export async function registerMigrationRoutes(
  app: FastifyInstance,
  options: MigrationRoutesOptions,
): Promise<void> {
  await app.register(async (migrationApp) => {
    await migrationApp.register(rateLimit, {
      max: 200,
      timeWindow: '1 minute',
      keyGenerator: (request) => {
        const header = request.headers[GAVETA_TOKEN_HEADER];
        return typeof header === 'string' ? header : 'unknown';
      },
    });

    migrationApp.post('/api/import/staging', async (_request, reply) => {
      const created = await createImportStagingSession();
      return reply.send(apiSuccess(created));
    });

    migrationApp.post(
      '/api/import/staging/file',
      { bodyLimit: API_IMPORT_FILE_BODY_LIMIT_BYTES },
      async (request, reply) => {
        const body = readJsonObjectBody(request);
        assertAllowedKeys(body, ['stagingId', 'relativePath', 'contentBase64']);
        const stagingId = requiredStringField(body, 'stagingId');
        const relativePath = requiredStringField(body, 'relativePath');
        const encoded = requiredStringField(body, 'contentBase64');
        let data: Buffer;
        try {
          data = Buffer.from(encoded, 'base64');
        } catch {
          throw new GavetaError('E_ARG_INVALID');
        }
        if (data.length === 0) {
          throw new GavetaError('E_ARG_INVALID');
        }
        await writeImportStagingFile(stagingId, relativePath, data);
        return reply.send(apiSuccess({ ok: true }));
      },
    );

    migrationApp.post('/api/import/preview', async (request, reply) => {
      const body = readJsonObjectBody(request);
      assertAllowedKeys(body, ['stagingId', 'in', 'exclude', 'onConflict', 'rootName']);
      const stagingId = requiredStringField(body, 'stagingId');
      const sourcePath = resolveImportStagingSource(
        stagingId,
        optionalStringField(body, 'rootName'),
      );
      const result = await importMarkdownFolder(
        buildImportOptions(options.vaultRoot, sourcePath, body, true),
      );
      return reply.send(apiSuccess(buildImportApiData(result)));
    });

    migrationApp.post('/api/import/commit', async (request, reply) => {
      const body = readJsonObjectBody(request);
      assertAllowedKeys(body, [
        'stagingId',
        'in',
        'exclude',
        'onConflict',
        'continueOnError',
        'rootName',
      ]);
      const stagingId = requiredStringField(body, 'stagingId');
      const sourcePath = resolveImportStagingSource(
        stagingId,
        optionalStringField(body, 'rootName'),
      );
      try {
        const result = await importMarkdownFolder(
          buildImportOptions(options.vaultRoot, sourcePath, body, false),
        );
        const data = buildImportApiData(result);
        return await reply.send(apiSuccess(data));
      } finally {
        await disposeImportStagingSession(stagingId);
      }
    });

    migrationApp.post('/api/export/preview', async (request, reply) => {
      const body = readJsonObjectBody(request);
      assertAllowedKeys(body, ['ref', 'all', 'links']);
      const report = await runExport(options.vaultRoot, body, true);
      return reply.send(apiSuccess(buildExportApiData(report)));
    });

    migrationApp.post('/api/export/download', async (request, reply) => {
      const body = readJsonObjectBody(request);
      assertAllowedKeys(body, ['ref', 'all', 'links', 'force']);
      const parent = await mkdtemp(path.join(tmpdir(), 'gaveta-export-'));
      const outDir = path.join(parent, 'markdown');
      try {
        const report = await runExport(options.vaultRoot, body, false, outDir);
        if (report.blocked) {
          throw new GavetaError('E_PATH_EXISTS');
        }
        const files = await collectFilesRecursive(outDir);
        if (files.length === 0) {
          throw new GavetaError('E_ARG_INVALID');
        }
        const zip = createZipBuffer(files);
        const label = exportArchiveName(body);
        return await reply
          .header('content-type', 'application/zip')
          .header('content-disposition', `attachment; filename="${label}.zip"`)
          .send(zip);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  });
}

function buildImportOptions(
  vaultRoot: string,
  sourcePath: string,
  body: Record<string, unknown>,
  dryRun: boolean,
): ImportMarkdownFolderOptions {
  const inFolder = optionalStringField(body, 'in');
  const exclude = optionalStringListField(body, 'exclude');
  return {
    vaultRoot,
    sourcePath,
    dryRun,
    onConflict: readOnConflict(body),
    ...(inFolder !== undefined ? { in: inFolder } : {}),
    ...(exclude !== undefined ? { exclude } : {}),
    ...(!dryRun && optionalBooleanField(body, 'continueOnError') === true
      ? { continueOnError: true }
      : {}),
  };
}

function exportArchiveName(body: Record<string, unknown>): string {
  const all = optionalBooleanField(body, 'all') === true;
  if (all) {
    return 'gaveta-vault';
  }
  const ref = optionalStringField(body, 'ref');
  if (ref === undefined || ref.length === 0) {
    return 'gaveta-export';
  }
  const base =
    ref
      .replace(/\.html$/iu, '')
      .split('/')
      .pop() ?? 'gaveta-export';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

async function runExport(
  vaultRoot: string,
  body: Record<string, unknown>,
  dryRun: boolean,
  outDir?: string,
): Promise<Awaited<ReturnType<typeof exportVaultToMarkdown>>> {
  const all = optionalBooleanField(body, 'all') === true;
  const ref = optionalStringField(body, 'ref');
  if (all && ref !== undefined && ref.length > 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (!all && (ref === undefined || ref.length === 0)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const links = optionalStringField(body, 'links');
  if (links !== undefined && links !== 'wiki' && links !== 'relative') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const parent =
    outDir !== undefined
      ? path.dirname(outDir)
      : await mkdtemp(path.join(tmpdir(), 'gaveta-export-dry-'));
  const targetOut = outDir ?? path.join(parent, 'preview');
  if (!dryRun) {
    await mkdir(targetOut, { recursive: true });
  }
  try {
    const base = {
      vaultRoot,
      cwd: parent,
      outDir: path.basename(targetOut),
      format: 'md' as const,
      dryRun,
      force: optionalBooleanField(body, 'force') === true,
    };
    if (all) {
      return await exportVaultToMarkdown({
        ...base,
        all: true,
        ...(links === 'wiki' || links === 'relative' ? { links } : {}),
      });
    }
    return await exportVaultToMarkdown({
      ...base,
      ref: ref ?? '',
      ...(links === 'wiki' || links === 'relative' ? { links } : {}),
    });
  } finally {
    if (outDir === undefined) {
      await rm(parent, { recursive: true, force: true });
    }
  }
}
