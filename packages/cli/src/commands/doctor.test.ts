import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DUPLICATE_ID, GHOST_TITLE, MISSING_ID, vaultPath } from '@gaveta/fixtures';
import { EXIT_CODES } from '@gaveta/core';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';
import { commands } from '../registry.ts';

interface Envelope {
  ok: boolean;
  data: {
    ok: boolean;
    findings: { code: string; path: string; details?: Record<string, string | number> }[];
    fixed: { path: string; codes: string[] }[];
  };
}

function capture(cwd: string): { io: CliIo; stdout: () => string; stderr: () => string } {
  let out = '';
  let err = '';
  return {
    io: {
      cwd,
      env: {},
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

async function withProblems(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-doctor-cli-'));
  try {
    const root = join(parent, 'problems');
    await cp(vaultPath('problems'), root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function countCode(findings: readonly { code: string }[], code: string): number {
  return findings.filter((finding) => finding.code === code).length;
}

it('is registered on the default command list', () => {
  expect(commands.map((command) => command.name)).toContain('doctor');
});

it('reports exactly one finding per problem type on the problems vault', async () => {
  await withProblems(async (root) => {
    const captured = capture(root);
    expect(await runCli(argv('doctor', '--json'), captured.io)).toBe(EXIT_CODES.validation);
    const body = JSON.parse(captured.stdout()) as Envelope;
    expect(body.data.ok).toBe(false);
    const findings = body.data.findings;
    expect(countCode(findings, 'E_LINK_BROKEN')).toBe(1);
    expect(countCode(findings, 'W_LINK_PENDING')).toBe(1);
    expect(countCode(findings, 'W_NOTE_ORPHAN')).toBe(1);
    expect(countCode(findings, 'E_ID_DUPLICATE')).toBe(1);
    expect(countCode(findings, 'E_TASK_INVALID')).toBe(1);
    expect(countCode(findings, 'W_LINK_HREF_STALE')).toBe(1);
    expect(countCode(findings, 'W_THEME_HREF')).toBe(1);

    const broken = findings.find((finding) => finding.code === 'E_LINK_BROKEN');
    expect(broken).toMatchObject({
      path: 'nota-rota.html',
      details: { targetId: MISSING_ID, href: 'no-existe.html' },
    });
    const pending = findings.find((finding) => finding.code === 'W_LINK_PENDING');
    expect(pending).toMatchObject({ path: 'nota-pendiente.html', details: { title: GHOST_TITLE } });
    const duplicate = findings.find((finding) => finding.code === 'E_ID_DUPLICATE');
    expect(duplicate?.details?.id).toBe(DUPLICATE_ID);
  });
});

it('repairs stale href and theme with --fix', async () => {
  await withProblems(async (root) => {
    const captured = capture(root);
    expect(await runCli(argv('doctor', '--fix', '--json'), captured.io)).toBe(
      EXIT_CODES.validation,
    );
    const body = JSON.parse(captured.stdout()) as Envelope;
    expect(body.data.fixed.map((item) => item.path).sort()).toEqual([
      'anidada/ruta-del-tema.html',
      'href-desfasado.html',
    ]);
    const hrefHtml = await readFile(join(root, 'href-desfasado.html'), 'utf8');
    expect(hrefHtml).toContain('href="nota-destino.html"');
    const themeHtml = await readFile(join(root, 'anidada/ruta-del-tema.html'), 'utf8');
    expect(themeHtml).toContain('href="../.gaveta/theme.css"');
  });
});
