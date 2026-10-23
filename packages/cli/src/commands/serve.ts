import { GavetaError } from '@gaveta/core';
import { GAVETA_SERVE_DEFAULT_PORT, GAVETA_SERVE_HOST, createGavetaServer } from '@gaveta/server';
import { CliFailure } from '../failure.ts';
import type { CommandResult, CommandSpec } from '../types.ts';
import { cliVersion } from './version.ts';

const BAD_PORT = 'El puerto tiene que ser un entero entre 0 y 65535.';

export const serveCommand: CommandSpec = {
  name: 'serve',
  summary: 'Arranca la API local de solo lectura en 127.0.0.1.',
  example: 'gaveta serve --port 3847 --json',
  requiresVault: true,
  input: 'none',
  options: [
    {
      name: 'port',
      flags: '--port <puerto>',
      description: 'Puerto TCP (0 = aleatorio). Por defecto 3847.',
    },
  ],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const port = readPort(context.options.port);
    const server = createGavetaServer({
      vaultRoot: context.vault.root,
      host: GAVETA_SERVE_HOST,
      port,
      cliVersion: cliVersion(),
    });
    const address = await server.listen();
    const data = {
      host: address.host,
      port: address.port,
      url: address.url,
      token: address.token,
    };
    const human = `Servidor local en ${address.url}\n`;
    if (context.emit !== undefined) {
      if (context.json) {
        context.emit.success(data);
      } else {
        context.emit.stdout(human);
      }
    }
    await server.waitForShutdown();
    return { data, human: '', deferSuccessOutput: true };
  },
};

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return GAVETA_SERVE_DEFAULT_PORT;
  }
  if (!/^\d+$/u.test(value)) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_PORT });
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_PORT });
  }
  return port;
}
