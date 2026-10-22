import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES } from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

const BACKLINKS_FIXTURE = join(
  fileURLToPath(new URL('../../../../fixtures/vaults/backlinks', import.meta.url)),
);

interface Envelope {
  ok: boolean;
  schemaVersion: number;
  command: string;
  data: unknown;
  warnings: { code: string }[];
  error?: { code: string; details?: { problem?: string } };
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

function argv(...parts: string[]): string[] {
  return ['node', 'gaveta', ...parts];
}

function parseEnvelope(stdout: string): Envelope {
  return JSON.parse(stdout) as Envelope;
}

async function withBacklinksVault(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-cli-connections-'));
  const root = join(parent, 'vault');
  try {
    await cp(BACKLINKS_FIXTURE, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

describe('connection commands', () => {
  it('lists outgoing links with stable JSON', async () => {
    await withBacklinksVault(async (root) => {
      const { io, stdout } = capture(root);
      expect(await runCli(argv('links', 'formas-de-enlace.html', '--json'), io)).toBe(
        EXIT_CODES.ok,
      );
      const body = parseEnvelope(stdout());
      expect(body.command).toBe('links');
      expect(body.data).toMatchSnapshot();
    });
  });

  it('lists backlinks with context', async () => {
    await withBacklinksVault(async (root) => {
      const { io, stdout } = capture(root);
      expect(await runCli(argv('backlinks', 'Nota X', '--json'), io)).toBe(EXIT_CODES.ok);
      const body = parseEnvelope(stdout());
      expect(body.command).toBe('backlinks');
      expect(body.data).toMatchSnapshot();
    });
  });

  it('returns the global graph and filters by rel', async () => {
    await withBacklinksVault(async (root) => {
      const global = capture(root);
      expect(await runCli(argv('graph', '--json'), global.io)).toBe(EXIT_CODES.ok);
      expect(parseEnvelope(global.stdout()).data).toMatchSnapshot('global graph');

      const filtered = capture(root);
      expect(await runCli(argv('graph', '--json', '--rel', 'depends-on'), filtered.io)).toBe(
        EXIT_CODES.ok,
      );
      const data = parseEnvelope(filtered.stdout()).data as {
        edges: { rel: string | null }[];
      };
      expect(data.edges.every((edge) => edge.rel === 'depends-on')).toBe(true);
    });
  });

  it('returns a local graph when ref and depth are set', async () => {
    await withBacklinksVault(async (root) => {
      const { io, stdout } = capture(root);
      expect(await runCli(argv('graph', 'nota-x.html', '--depth', '1', '--json'), io)).toBe(
        EXIT_CODES.ok,
      );
      const body = parseEnvelope(stdout());
      expect(body.data).toMatchSnapshot('local depth 1');
    });
  });

  it('rejects depth out of range and depth without ref', async () => {
    await withBacklinksVault(async (root) => {
      const deep = capture(root);
      expect(await runCli(argv('graph', 'nota-x.html', '--depth', '4', '--json'), deep.io)).toBe(
        EXIT_CODES.usage,
      );
      expect(parseEnvelope(deep.stdout()).error?.code).toBe('E_ARG_INVALID');

      const lonely = capture(root);
      expect(await runCli(argv('graph', '--depth', '1', '--json'), lonely.io)).toBe(
        EXIT_CODES.usage,
      );
      expect(parseEnvelope(lonely.stdout()).error?.details?.problem).toContain('profundidad');

      const missing = capture(root);
      expect(await runCli(argv('graph', 'nota-x.html', '--json'), missing.io)).toBe(
        EXIT_CODES.usage,
      );
    });
  });

  it('adds a link idempotently through the CLI', async () => {
    await withBacklinksVault(async (root) => {
      const first = capture(root);
      expect(
        await runCli(
          argv('link', 'destino-enlace.html', 'nota-x.html', '--rel', 'related', '--json'),
          first.io,
        ),
      ).toBe(EXIT_CODES.ok);
      const once = parseEnvelope(first.stdout()) as Envelope & {
        data: { added: boolean; hash: string };
      };
      expect(once.data.added).toBe(true);

      const second = capture(root);
      expect(
        await runCli(
          argv(
            'link',
            'destino-enlace.html',
            'nota-x.html',
            '--rel',
            'related',
            '--text',
            'Nota X',
            '--json',
          ),
          second.io,
        ),
      ).toBe(EXIT_CODES.ok);
      const twice = parseEnvelope(second.stdout()) as Envelope & {
        data: { added: boolean; hash: string };
      };
      expect(twice.data.added).toBe(false);
      expect(twice.data.hash).toBe(once.data.hash);
    });
  });
});
