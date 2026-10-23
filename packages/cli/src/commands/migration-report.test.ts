import { expect, it } from 'vitest';
import { buildExportCliData, buildImportCliData } from './migration-report.ts';

it('builds import CLI data with action counts', () => {
  const data = buildImportCliData({
    ok: true,
    dryRun: false,
    notes: [
      {
        sourceMd: 'a.md',
        path: 'a.html',
        id: '01',
        title: 'A',
        warnings: [],
        links: [],
        action: 'create',
      },
      {
        sourceMd: 'b.md',
        path: 'b.html',
        id: '02',
        title: 'B',
        warnings: [],
        links: [],
        action: 'skip',
      },
    ],
    failures: [{ sourceMd: 'c.md', path: 'c.html', code: 'E_IMPORT_PARSE' }],
    attachments: [{ vaultPath: 'attachments/x.png', hash: 'h', deduplicated: false }],
  });
  expect(data.summary).toEqual({
    created: 1,
    overwritten: 0,
    renamed: 0,
    skipped: 1,
    failed: 1,
    attachments: 1,
  });
});

it('builds export CLI data with blocked conflicts', () => {
  const data = buildExportCliData({
    dryRun: true,
    blocked: true,
    outDir: '/tmp/out',
    notes: [{ path: 'a.md', source: 'a.html', warnings: [], losses: [] }],
    attachments: ['attachments/pixel.png'],
    conflicts: [{ path: 'a.md', code: 'E_PATH_EXISTS', detail: 'exists' }],
  });
  expect(data.ok).toBe(false);
  expect(data.summary.created).toBe(1);
  expect(data.summary.failed).toBe(1);
  expect(data.summary.attachments).toBe(1);
});
