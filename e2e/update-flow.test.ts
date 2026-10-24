import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LEGACY_THEME_CSS } from '../packages/core/src/vault/shipped-asset-hashes.ts';
import { DEFAULT_THEME_CSS } from '../packages/core/src/theme/theme.ts';
import { REPO_ROOT, childEnv, parseJson, runGaveta } from './helpers.ts';

function runGit(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr || result.stdout}`);
  }
}

it('fast-forwards main without a version bump and refreshes untouched vault theme', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-update-flow-'));
  try {
    const bare = join(parent, 'origin.git');
    const checkout = join(parent, 'checkout');
    const bump = join(parent, 'bump');
    runGit(parent, ['clone', '--bare', '--branch', 'main', `file://${REPO_ROOT}`, bare]);
    runGit(parent, ['clone', bare, checkout]);
    runGit(checkout, ['config', 'user.email', 'gaveta@test.local']);
    runGit(checkout, ['config', 'user.name', 'Gaveta E2E']);
    runGit(checkout, ['checkout', '-B', 'main']);
    const official = 'https://github.com/antonioaren/gaveta.git';
    const bareUrl = `file://${bare}`;
    runGit(checkout, ['remote', 'set-url', 'origin', official]);
    runGit(checkout, ['config', `url.${bareUrl}.insteadOf`, official]);

    const marker = join(checkout, '.gaveta-update-flow-marker');
    writeFileSync(marker, 'v1\n');
    runGit(checkout, ['add', '.gaveta-update-flow-marker']);
    runGit(checkout, ['commit', '-m', 'chore: flow marker without version bump']);
    runGit(checkout, ['push', '-u', 'origin', 'main']);
    runGit(checkout, ['reset', '--hard', 'HEAD~1']);

    const vaultRoot = join(parent, 'vault-flow');
    const init = runGaveta(['init', '--json', vaultRoot]);
    expect(init.status).toBe(0);

    const untouchedTheme = join(vaultRoot, '.gaveta', 'theme.css');
    writeFileSync(untouchedTheme, LEGACY_THEME_CSS);
    const configPath = join(vaultRoot, '.gaveta', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    delete config.assets;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const editedVault = join(parent, 'vault-edited');
    const initEdited = runGaveta(['init', '--json', editedVault]);
    expect(initEdited.status).toBe(0);
    writeFileSync(join(editedVault, '.gaveta', 'theme.css'), '/* user custom */\n');

    runGit(parent, ['clone', bare, bump]);
    runGit(bump, ['config', 'user.email', 'gaveta@test.local']);
    runGit(bump, ['config', 'user.name', 'Gaveta E2E']);
    runGit(bump, ['remote', 'set-url', 'origin', official]);
    runGit(bump, ['config', `url.${bareUrl}.insteadOf`, official]);
    runGit(bump, ['fetch', 'origin']);
    runGit(bump, ['checkout', '-B', 'main', 'origin/main']);
    writeFileSync(join(bump, '.gaveta-update-flow-marker'), 'v2\n');
    runGit(bump, ['add', '.gaveta-update-flow-marker']);
    runGit(bump, ['commit', '-m', 'chore: second marker']);
    runGit(bump, ['push', 'origin', 'main']);

    const updateEnv = childEnv({ GAVETA_UPDATE_REPO_ROOT: checkout });
    const check = runGaveta(['update', '--check', '--json', '--channel', 'main'], {
      env: updateEnv,
    });
    expect(check.status).toBe(1);
    const checkPayload = parseJson<{ upToDate: boolean; newCommits: number }>(check.stdout);
    expect(checkPayload.data.upToDate).toBe(false);
    expect(checkPayload.data.newCommits).toBeGreaterThanOrEqual(1);

    const apply = runGaveta(['update', '--json', '--channel', 'main', '--vault', vaultRoot], {
      env: updateEnv,
    });
    expect(apply.status).toBe(0);

    expect(readFileSync(untouchedTheme, 'utf8')).toBe(DEFAULT_THEME_CSS);

    const assetsEdited = runGaveta(['update', '--assets-only', '--json', '--vault', editedVault], {
      env: updateEnv,
    });
    expect(assetsEdited.status).toBe(0);
    expect(readFileSync(join(editedVault, '.gaveta', 'theme.css'), 'utf8')).toBe(
      '/* user custom */\n',
    );
    const assetsPayload = parseJson<{ warnings?: { code: string }[] }>(assetsEdited.stdout);
    expect(assetsPayload.warnings?.some((w) => w.code === 'W_VAULT_ASSET_MODIFIED')).toBe(true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);

it('version --json succeeds on a checkout with a non-official origin URL', () => {
  const version = runGaveta(['version', '--json']);
  expect(version.status).toBe(0);
});
