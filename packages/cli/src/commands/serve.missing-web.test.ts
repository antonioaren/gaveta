import { expect, it, vi } from 'vitest';
import { createGavetaServer } from '@gaveta/server';
import * as webDist from '../web-dist.ts';
import { serveCommand } from './serve.ts';

vi.mock('@gaveta/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gaveta/server')>();
  return {
    ...actual,
    createGavetaServer: vi.fn(),
  };
});

it('starts API-only when the web build is missing and surfaces W_WEB_VIEWER_MISSING', async () => {
  vi.spyOn(webDist, 'webDistReady').mockReturnValue(false);
  const listen = vi.fn().mockResolvedValue({
    host: '127.0.0.1',
    port: 3847,
    token: 't',
    url: 'http://127.0.0.1:3847/?token=t',
  });
  const waitForShutdown = vi.fn().mockResolvedValue(undefined);
  vi.mocked(createGavetaServer).mockReturnValue({
    app: {},
    listen,
    close: vi.fn(),
    waitForShutdown,
  } as never);

  const emitted: unknown[] = [];
  if (serveCommand.run === undefined) {
    throw new Error('serve command missing run');
  }
  const result = await serveCommand.run({
    cwd: '/tmp',
    env: {},
    json: true,
    vaultOption: undefined,
    vault: { root: '/tmp/vault', source: 'option' },
    strictRel: false,
    input: null,
    positionals: [],
    options: {},
    emit: {
      success: (data, warnings) => {
        emitted.push({ data, warnings });
      },
      stdout: () => undefined,
    },
  });

  expect(vi.mocked(createGavetaServer)).toHaveBeenCalledWith(
    expect.objectContaining({ vaultRoot: '/tmp/vault' }),
  );
  expect(vi.mocked(createGavetaServer).mock.calls[0]?.[0]).not.toHaveProperty('webRoot');
  expect(result.warnings?.[0]?.code).toBe('W_WEB_VIEWER_MISSING');
  vi.restoreAllMocks();
});
