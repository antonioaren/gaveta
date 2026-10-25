import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');
const BACKLINKS = join(root, 'fixtures/vaults/backlinks');

function run(args: readonly string[], cwd: string): { stdout: string; status: number } {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GAVETA_VAULT: undefined },
  });
  return { stdout: result.stdout, status: result.status ?? 1 };
}

it('exposes links, backlinks, link, and graph on the binary', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-connections-'));
  const vault = join(parent, 'vault');
  cpSync(BACKLINKS, vault, { recursive: true });
  try {
    const links = run(['links', 'destino-enlace.html', '--json'], vault);
    expect(links.status).toBe(0);
    const linksBody = JSON.parse(links.stdout) as { command: string };
    expect(linksBody.command).toBe('links');

    const graph = run(['graph', '--json'], vault);
    expect(graph.status).toBe(0);
    const graphBody = JSON.parse(graph.stdout) as { data: { nodes: unknown[] } };
    expect(graphBody.data.nodes.length).toBeGreaterThan(0);

    const mentions = run(['mentions', 'Nota X', '--json'], vault);
    expect(mentions.status).toBe(0);
    const mentionsBody = JSON.parse(mentions.stdout) as { command: string };
    expect(mentionsBody.command).toBe('mentions');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
