import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vaultPath, type VaultName } from '@gaveta/fixtures';

export const REPO_ROOT = join(import.meta.dirname, '..');
export const GAVETA_BIN = join(REPO_ROOT, 'packages/cli/bin/gaveta.js');

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

export interface JsonEnvelope<T = unknown> {
  readonly ok: boolean;
  readonly schemaVersion: number;
  readonly command: string;
  readonly data: T;
  readonly warnings?: { code: string }[];
  readonly error?: { code: string; message?: string; hint?: string; details?: unknown };
}

export interface GraphPayload {
  readonly nodes: {
    readonly id: string;
    readonly title: string;
    readonly type: string;
    readonly path: string;
    readonly ghost?: boolean;
    readonly tags?: string[];
  }[];
  readonly edges: {
    readonly from: string;
    readonly to: string;
    readonly rel: string | null;
  }[];
}

export function childEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GAVETA_VAULT;
  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value;
  }
  return env;
}

export function runGaveta(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly input?: Buffer | string;
    readonly vault?: string;
  } = {},
): RunResult {
  const argv = options.vault === undefined ? [...args] : [...args, '--vault', options.vault];
  const result = spawnSync(process.execPath, [GAVETA_BIN, ...argv], {
    cwd: options.cwd,
    env: options.env ?? childEnv(),
    encoding: 'utf8',
    input: options.input,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

export function parseJson<T>(stdout: string): JsonEnvelope<T> {
  return JSON.parse(stdout) as JsonEnvelope<T>;
}

export function withTempVault(
  run: (vault: string) => void,
  options: { readonly prefix?: string; readonly fixture?: VaultName } = {},
): void {
  const parent = mkdtempSync(join(tmpdir(), options.prefix ?? 'gaveta-e2e-'));
  const vault = join(parent, 'vault');
  try {
    if (options.fixture !== undefined) {
      cpSync(vaultPath(options.fixture), vault, { recursive: true });
    } else {
      mkdirSync(vault, { recursive: true });
    }
    run(vault);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

export function initVault(directory: string, extraArgs: readonly string[] = []): RunResult {
  return runGaveta(['init', '--json', ...extraArgs], { cwd: directory });
}

/** Stable graph snapshot for comparing before/after reindex (REQ-VAULT-06). */
export function stableGraph(stdout: string): {
  nodes: { id: string; title: string; type: string; path: string; ghost: boolean }[];
  edges: { from: string; to: string; rel: string | null }[];
} {
  const data = parseJson<GraphPayload>(stdout).data;
  const nodes = data.nodes
    .map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      path: node.path,
      ghost: node.ghost === true,
    }))
    .sort((left, right) =>
      (left.id || left.path || left.title).localeCompare(right.id || right.path || right.title),
    );
  const edges = data.edges
    .map((edge) => ({ from: edge.from, to: edge.to, rel: edge.rel }))
    .sort((left, right) =>
      `${left.from}:${left.to}:${left.rel ?? ''}`.localeCompare(
        `${right.from}:${right.to}:${right.rel ?? ''}`,
      ),
    );
  return { nodes, edges };
}

export function hasUnsafeTag(html: string, tag: string): boolean {
  const open = `<${tag}`;
  let index = 0;
  while (index < html.length) {
    const found = html.indexOf(open, index);
    if (found === -1) {
      return false;
    }
    const next = html[found + open.length];
    if (next === '>' || next === ' ' || next === '/') {
      return true;
    }
    index = found + open.length;
  }
  return false;
}
