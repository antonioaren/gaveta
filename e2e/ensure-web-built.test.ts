import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSyncMock = vi.hoisted(() => vi.fn(() => Buffer.from('')));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: execFileSyncMock,
  };
});

const STAMP = join(import.meta.dirname, '../node_modules/.cache/gaveta-e2e-web-built.stamp');
const REPO_ROOT = join(import.meta.dirname, '..');

describe('ensureWebBuilt / prepareWebDistForE2eRun', () => {
  beforeEach(() => {
    execFileSyncMock.mockClear();
    rmSync(STAMP, { force: true });
    delete process.env.GAVETA_E2E_WEB_PREBUILT;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(STAMP, { force: true });
    delete process.env.GAVETA_E2E_WEB_PREBUILT;
  });

  it('does not run build:web when CI marks the dist prebuilt', async () => {
    process.env.GAVETA_E2E_WEB_PREBUILT = '1';
    const { ensureWebBuilt } = await import('./helpers.ts');
    ensureWebBuilt();
    ensureWebBuilt();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('does not run build:web in workers after globalSetup wrote the stamp', async () => {
    mkdirSync(join(REPO_ROOT, 'node_modules/.cache'), { recursive: true });
    writeFileSync(STAMP, '1\n', 'utf8');
    const { ensureWebBuilt } = await import('./helpers.ts');
    ensureWebBuilt();
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it('prepareWebDistForE2eRun always builds locally and leaves a stamp', async () => {
    const { prepareWebDistForE2eRun } = await import('./helpers.ts');
    prepareWebDistForE2eRun();
    expect(execFileSyncMock).toHaveBeenCalledWith('pnpm', ['build:web'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    expect(existsSync(STAMP)).toBe(true);
  });

  it('prepareWebDistForE2eRun skips the build when CI set prebuilt', async () => {
    process.env.GAVETA_E2E_WEB_PREBUILT = '1';
    const { prepareWebDistForE2eRun } = await import('./helpers.ts');
    prepareWebDistForE2eRun();
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(existsSync(STAMP)).toBe(false);
  });
});
