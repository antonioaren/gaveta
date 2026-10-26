import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { vaultPath, type VaultName } from '@gaveta/fixtures';
import { computeIndexStats, computeLogStats, computeVaultStats } from './stats.ts';
import { GAVETA_DIRECTORY } from './vault/constants.ts';

async function withFixture(name: VaultName, run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-stats-'));
  try {
    const root = join(parent, name);
    await cp(vaultPath(name), root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

describe('computeLogStats (REQ-CLI-15)', () => {
  it('aggregates command success, validation density, p95 latency, and active days', () => {
    const now = '2026-10-26T12:00:00.000Z';
    const stats = computeLogStats(
      [
        {
          ts: '2026-10-26T10:00:00.000Z',
          command: 'new',
          ok: true,
          durationMs: 100,
          outgoingLinks: 2,
        },
        {
          ts: '2026-10-25T10:00:00.000Z',
          command: 'new',
          ok: false,
          durationMs: 50,
          validationErrors: 3,
        },
        {
          ts: '2026-10-24T10:00:00.000Z',
          command: 'search',
          ok: true,
          durationMs: 400,
        },
      ],
      { now },
    );
    expect(stats.present).toBe(true);
    expect(stats.commandEntries).toBe(3);
    expect(stats.commandSuccessRate).toBeCloseTo(2 / 3);
    expect(stats.validationErrorsPerNoteCreated).toBe(1.5);
    expect(stats.averageOutgoingLinksPerNoteCreated).toBe(2);
    expect(stats.cliDurationP95Ms).toBe(400);
    expect(stats.activeDaysLast7).toBe(3);
  });

  it('returns null rates when the log has no applicable entries', () => {
    const stats = computeLogStats([], { now: '2026-10-26T12:00:00.000Z' });
    expect(stats.present).toBe(true);
    expect(stats.commandEntries).toBe(0);
    expect(stats.commandSuccessRate).toBeNull();
    expect(stats.validationErrorsPerNoteCreated).toBeNull();
    expect(stats.averageOutgoingLinksPerNoteCreated).toBeNull();
    expect(stats.cliDurationP95Ms).toBeNull();
    expect(stats.activeDaysLast7).toBe(0);
  });
});

describe('computeVaultStats (REQ-CLI-15)', () => {
  it('matches doctor link and orphan counts in the problems fixture', async () => {
    await withFixture('problems', async (root) => {
      const stats = await computeVaultStats(root);
      expect(stats.index.brokenLinks).toBe(1);
      expect(stats.index.pendingLinks).toBe(1);
      expect(stats.index.orphanNotes).toBe(1);
      expect(stats.index.notes).toBeGreaterThan(0);
      expect(stats.index.connectedNotes).toBe(stats.index.notes - stats.index.orphanNotes);
      expect(stats.log).toMatchObject({ present: false });
    });
  });

  it('includes log metrics when .gaveta/log.jsonl exists', async () => {
    await withFixture('empty', async (root) => {
      const logPath = join(root, GAVETA_DIRECTORY, 'log.jsonl');
      await writeFile(
        logPath,
        [
          JSON.stringify({
            ts: '2026-10-26T11:00:00.000Z',
            command: 'new',
            ok: true,
            durationMs: 80,
            outgoingLinks: 1,
          }),
          JSON.stringify({
            ts: '2026-10-26T11:01:00.000Z',
            command: 'validate',
            ok: true,
            durationMs: 20,
          }),
        ].join('\n') + '\n',
        'utf8',
      );
      const stats = await computeVaultStats(root, { now: '2026-10-26T12:00:00.000Z' });
      expect(stats.log).toMatchObject({
        present: true,
        commandEntries: 2,
        commandSuccessRate: 1,
        cliDurationP95Ms: 80,
        activeDaysLast7: 1,
      });
    });
  });
});

describe('computeIndexStats', () => {
  it('computes rates as fractions between 0 and 1', () => {
    const stats = computeIndexStats({
      notes: [
        {
          path: 'a.html',
          id: '01',
          title: 'A',
          titleFolded: 'a',
          type: 'doc',
          created: null,
          updated: null,
          tags: [],
          aliases: [],
          plainText: '',
          contentHash: '',
          mtimeMs: 0,
          sizeBytes: 0,
        },
        {
          path: 'b.html',
          id: '02',
          title: 'B',
          titleFolded: 'b',
          type: 'doc',
          created: null,
          updated: null,
          tags: [],
          aliases: [],
          plainText: '',
          contentHash: '',
          mtimeMs: 0,
          sizeBytes: 0,
        },
      ],
      links: [
        {
          path: 'a.html',
          ordinal: 0,
          kind: 'canonical',
          text: 'B',
          href: 'b.html',
          targetId: '02',
          pendingTitle: null,
          rel: null,
          sectionId: null,
          ghost: false,
          wikilinkTitle: null,
          wikilinkSection: null,
          wikilinkLabel: null,
        },
      ],
      byId: new Map([
        [
          '01',
          [
            {
              path: 'a.html',
              id: '01',
              title: 'A',
              titleFolded: 'a',
              type: 'doc',
              created: null,
              updated: null,
              tags: [],
              aliases: [],
              plainText: '',
              contentHash: '',
              mtimeMs: 0,
              sizeBytes: 0,
            },
          ],
        ],
        [
          '02',
          [
            {
              path: 'b.html',
              id: '02',
              title: 'B',
              titleFolded: 'b',
              type: 'doc',
              created: null,
              updated: null,
              tags: [],
              aliases: [],
              plainText: '',
              contentHash: '',
              mtimeMs: 0,
              sizeBytes: 0,
            },
          ],
        ],
      ]),
    });
    expect(stats.notes).toBe(2);
    expect(stats.orphanNotes).toBe(0);
    expect(stats.connectedNotes).toBe(2);
    expect(stats.connectedNoteRate).toBe(1);
    expect(stats.averageOutgoingLinksPerNote).toBe(0.5);
  });
});
