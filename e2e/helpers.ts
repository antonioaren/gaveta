import { type ChildProcess, execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { vaultPath, type VaultName } from '@gaveta/fixtures';

/** Playwright chord for CodeMirror / app `Mod-*` bindings (Cmd on macOS, Ctrl elsewhere). */
export function modChord(key: string): string {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  return `${mod}+${key}`;
}

/** Pin the web shell to Spanish for e2e assertions written against `es` copy. */
export async function newWebPage(browser: Browser) {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('gaveta.locale', 'es');
  });
  return page;
}

export const REPO_ROOT = join(import.meta.dirname, '..');
export const GAVETA_BIN = join(REPO_ROOT, 'packages/cli/bin/gaveta.js');

export const GAVETA_E2E_WEB_PREBUILT_ENV = 'GAVETA_E2E_WEB_PREBUILT';

const E2E_WEB_BUILT_STAMP = join(REPO_ROOT, 'node_modules/.cache/gaveta-e2e-web-built.stamp');

let webBuildEnsured = false;

function isE2eWebPrebuiltInCi(): boolean {
  return process.env[GAVETA_E2E_WEB_PREBUILT_ENV] === '1';
}

function runWebBuild(): void {
  execFileSync('pnpm', ['build:web'], { cwd: REPO_ROOT, stdio: 'inherit' });
}

/** Vitest `globalSetup`: fresh web build once per e2e run (unless CI already built). */
export function prepareWebDistForE2eRun(): void {
  if (isE2eWebPrebuiltInCi()) {
    return;
  }
  runWebBuild();
  mkdirSync(join(REPO_ROOT, 'node_modules/.cache'), { recursive: true });
  writeFileSync(E2E_WEB_BUILT_STAMP, `${String(Date.now())}\n`, 'utf8');
}

export function teardownWebDistForE2eRun(): void {
  rmSync(E2E_WEB_BUILT_STAMP, { force: true });
}

/**
 * No-op after the first call in a worker when globalSetup built or CI set
 * `GAVETA_E2E_WEB_PREBUILT=1`. Playwright suites call this from `beforeAll`.
 */
export function ensureWebBuilt(): void {
  if (webBuildEnsured) {
    return;
  }
  if (isE2eWebPrebuiltInCi() || existsSync(E2E_WEB_BUILT_STAMP)) {
    webBuildEnsured = true;
    return;
  }
  runWebBuild();
  webBuildEnsured = true;
}

/** Vault-internal paths created on first `gaveta init` (REQ-TYPE-07 templates included). */
export const INIT_VAULT_INTERNAL_PATHS = [
  '.gaveta/config.json',
  '.gaveta/theme.css',
  '.gaveta/mermaid.min.js',
  '.gaveta/mermaid-boot.js',
  '.gaveta/MERMAID-LICENSE.txt',
  '.gaveta/index.sqlite',
  '.gaveta/templates/doc.html',
  '.gaveta/templates/slides.html',
  '.gaveta/templates/todo.html',
  '.gaveta/templates/dashboard.html',
  '.gaveta/templates/design.html',
  '.gaveta/templates/artifact.html',
] as const;

/** Writable directory for Playwright screenshots (cloud artifacts or temp). */
export function resolveScreenshotDir(fallbackName: string): string {
  const cloud = '/opt/cursor/artifacts';
  try {
    mkdirSync(cloud, { recursive: true });
    return cloud;
  } catch {
    const fallback = join(tmpdir(), fallbackName);
    mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

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

/** Remove a temp vault tree; retries while macOS CI still has serve/SQLite handles open. */
export function removeTempTree(target: string): void {
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

export async function stopServeChildren(children: ChildProcess[]): Promise<void> {
  const batch = children.splice(0);
  if (batch.length === 0) {
    return;
  }
  await Promise.all(
    batch.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }
          const finish = (): void => {
            resolve();
          };
          child.once('exit', finish);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null) {
              child.kill('SIGKILL');
            }
            finish();
          }, 5_000);
        }),
    ),
  );
}

export function childEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GAVETA_VAULT;
  env.GAVETA_LANG ??= 'es';
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

export async function withTempVaultAsync(
  run: (vault: string) => Promise<void>,
  options: { readonly prefix?: string; readonly fixture?: VaultName } = {},
): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), options.prefix ?? 'gaveta-e2e-'));
  const vault = join(parent, 'vault');
  try {
    if (options.fixture !== undefined) {
      cpSync(vaultPath(options.fixture), vault, { recursive: true });
    } else {
      mkdirSync(vault, { recursive: true });
    }
    await run(vault);
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
