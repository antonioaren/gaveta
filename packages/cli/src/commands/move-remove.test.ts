import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLINK_COUNT, NOTE_X, linkerSpec, vaultPath, type VaultName } from '@gaveta/fixtures';
import {
  EXIT_CODES,
  doctorVault,
  noteContentHash,
  readVaultText,
  relativeNoteHref,
} from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

interface Envelope {
  ok: boolean;
  command: string;
  data?: {
    id: string | null;
    from: string;
    to: string;
    rewritten: string[];
    path?: string;
    title?: string;
    forced?: boolean;
    pending?: string[];
  };
  error?: {
    code: string;
    details?: { problem?: string; affected?: unknown[] };
  };
}

async function withVault(name: VaultName, run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-cli-mv-'));
  try {
    const root = join(parent, name);
    await cp(vaultPath(name), root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function capture(cwd: string): { io: CliIo; stdout: () => string; stderr: () => string } {
  let out = '';
  let err = '';
  return {
    io: {
      cwd,
      stdout(chunk: string) {
        out += chunk;
      },
      stderr(chunk: string) {
        err += chunk;
      },
    },
    stdout: () => out,
    stderr: () => err,
  };
}

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

describe('mv and rm', () => {
  it('moves note X and rewrites twenty backlinks with JSON output', async () => {
    await withVault('backlinks', async (root) => {
      const before = new Map<string, string>();
      for (let index = 1; index <= BACKLINK_COUNT; index += 1) {
        const spec = linkerSpec(index);
        before.set(spec.path, await readFile(join(root, spec.path), 'utf8'));
      }
      const hash = noteContentHash(await readVaultText(root, NOTE_X.path));
      const moved = capture(root);
      expect(
        await runCli(argv('mv', 'Nota X', 'otra/ruta', '--if-match', hash, '--json'), moved.io),
      ).toBe(EXIT_CODES.ok);
      const body = JSON.parse(moved.stdout()) as Envelope;
      expect(body.ok).toBe(true);
      expect(body.command).toBe('mv');
      expect(body.data?.from).toBe(NOTE_X.path);
      expect(body.data?.to).toBe('otra/ruta.html');
      expect(body.data?.rewritten).toHaveLength(BACKLINK_COUNT);

      for (let position = 1; position <= BACKLINK_COUNT; position += 1) {
        const spec = linkerSpec(position);
        const previous = before.get(spec.path);
        const href = relativeNoteHref(spec.path, 'otra/ruta.html');
        expect(previous).toBeTypeOf('string');
        expect(href).toBeTypeOf('string');
        if (previous === undefined || href === null) {
          return;
        }
        const html = await readFile(join(root, spec.path), 'utf8');
        const needle = position <= 10 ? 'href="../nota-x.html"' : 'href="../../nota-x.html"';
        expect(html).toBe(previous.replace(needle, `href="${href}"`));
      }

      const report = await doctorVault(root);
      expect(report.findings.filter((finding) => finding.code === 'E_LINK_BROKEN')).toHaveLength(0);
      expect(moved.stderr()).toBe('');
      expect(moved.stdout()).toContain('"rewritten"');
    });
  });

  it('prints Spanish human output for mv', async () => {
    await withVault('backlinks', async (root) => {
      const human = capture(root);
      expect(await runCli(argv('mv', NOTE_X.id, 'equis.html'), human.io)).toBe(EXIT_CODES.ok);
      expect(human.stdout()).toContain(`Movida ${NOTE_X.path} → equis.html`);
      expect(human.stdout()).toContain(NOTE_X.id);
      expect(human.stdout()).toContain('notas reescritas');
    });
  });

  it('refuses rm when backlinks exist and lists affected notes in JSON', async () => {
    await withVault('backlinks', async (root) => {
      const failed = capture(root);
      expect(await runCli(argv('rm', 'Nota X', '--json'), failed.io)).toBe(EXIT_CODES.validation);
      const body = JSON.parse(failed.stdout()) as Envelope;
      expect(body.error?.code).toBe('E_HAS_BACKLINKS');
      expect(body.error?.details?.affected).toHaveLength(BACKLINK_COUNT);
      expect(await readVaultText(root, NOTE_X.path)).toContain(NOTE_X.title);
    });
  });

  it('removes with --force and doctor reports pending links, not broken', async () => {
    await withVault('backlinks', async (root) => {
      const removed = capture(root);
      expect(await runCli(argv('rm', NOTE_X.path, '--force', '--json'), removed.io)).toBe(
        EXIT_CODES.ok,
      );
      const body = JSON.parse(removed.stdout()) as Envelope;
      expect(body.data?.forced).toBe(true);
      expect(body.data?.pending).toHaveLength(BACKLINK_COUNT);
      await expect(readVaultText(root, NOTE_X.path)).rejects.toThrow();

      const report = await doctorVault(root);
      expect(report.findings.filter((finding) => finding.code === 'E_LINK_BROKEN')).toHaveLength(0);
      expect(
        report.findings.filter((finding) => finding.code === 'W_LINK_PENDING').length,
      ).toBeGreaterThan(0);
    });
  });

  it('rejects a bad --if-match hash before moving', async () => {
    await withVault('backlinks', async (root) => {
      const conflict = capture(root);
      expect(
        await runCli(
          argv('mv', 'Nota X', 'otra/ruta', '--if-match', `sha256:${'ab'.repeat(32)}`, '--json'),
          conflict.io,
        ),
      ).toBe(EXIT_CODES.conflict);
      expect((JSON.parse(conflict.stdout()) as Envelope).error?.code).toBe('E_CONFLICT');
      expect(await readVaultText(root, NOTE_X.path)).toContain(NOTE_X.title);
    });
  });
});
