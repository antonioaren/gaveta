import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_CODES } from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

const BACKLINKS_FIXTURE = join(
  fileURLToPath(new URL('../../../../fixtures/vaults/backlinks', import.meta.url)),
);

function capture(cwd: string): { io: CliIo; stdout: () => string } {
  let out = '';
  return {
    io: {
      cwd,
      stdout(chunk: string) {
        out += chunk;
      },
    },
    stdout: () => out,
  };
}

function argv(...parts: string[]): string[] {
  return ['node', 'gaveta', ...parts];
}

interface Envelope {
  error?: { code: string };
  data?: { path: string };
}

function parseEnvelope(stdout: string): Envelope {
  return JSON.parse(stdout) as Envelope;
}

async function withVault(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-cli-conn-sec-'));
  const root = join(parent, 'vault');
  try {
    await cp(BACKLINKS_FIXTURE, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

describe('connection command security', () => {
  it('rejects path traversal in refs', async () => {
    await withVault(async (root) => {
      const links = capture(root);
      expect(await runCli(argv('links', '../secret.html', '--json'), links.io)).toBe(
        EXIT_CODES.notFound,
      );
      expect(parseEnvelope(links.stdout()).error?.code).toBe('E_REF_NOT_FOUND');

      const backlinks = capture(root);
      expect(await runCli(argv('backlinks', '/etc/passwd', '--json'), backlinks.io)).toBe(
        EXIT_CODES.notFound,
      );
    });
  });

  it('escapes hostile link text instead of injecting HTML', async () => {
    await withVault(async (root) => {
      const payload = '<img src=x onerror=alert(1)>';
      const { io, stdout } = capture(root);
      expect(
        await runCli(
          argv('link', 'destino-enlace.html', 'nota-x.html', '--text', payload, '--json'),
          io,
        ),
      ).toBe(EXIT_CODES.ok);
      const body = parseEnvelope(stdout()).data;
      if (body === undefined) {
        throw new Error('missing path');
      }
      const html = await readFile(join(root, body.path), 'utf8');
      expect(html.toLowerCase().includes('<script')).toBe(false);
      expect(html.includes('<img')).toBe(false);
      expect(html).toContain('&lt;img');
    });
  });
});
