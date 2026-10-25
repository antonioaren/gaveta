import { GavetaError } from '@gaveta/core';
import { GAVETA_SERVE_DEFAULT_PORT, GAVETA_SERVE_HOST, createGavetaServer } from '@gaveta/server';
import { CliFailure } from '../failure.ts';
import type { CommandResult, CommandSpec, CommandWarning } from '../types.ts';
import { resolveWebDistRoot, webDistReady } from '../web-dist.ts';
import { cliVersion } from './version.ts';

const BAD_PORT = 'cli.auto.el_puerto_tiene_que_ser_un_entero_entre_0_y_6553';
const WEB_VIEWER_MISSING_HUMAN =
  'Aviso: el visor web no está compilado (solo API). Ejecuta `pnpm build:web` en la raíz del repositorio.\n';

export const serveCommand: CommandSpec = {
  name: 'serve',
  summary: 'cli.auto.arranca_la_api_local_de_solo_lectura_en_127_0_0_',
  example: 'gaveta serve --port 3847 --json',
  requiresVault: true,
  input: 'none',
  options: [
    {
      name: 'port',
      flags: '--port <puerto>',
      description: 'cli.auto.puerto_tcp_0_aleatorio_por_defecto_3847',
    },
  ],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const port = readPort(context.options.port);
    const warnings: CommandWarning[] = [];
    const webReady = webDistReady();
    if (!webReady) {
      warnings.push({ code: 'W_WEB_VIEWER_MISSING' });
      if (context.emit !== undefined && !context.json) {
        context.emit.stdout(WEB_VIEWER_MISSING_HUMAN);
      }
    }
    const server = createGavetaServer({
      vaultRoot: context.vault.root,
      host: GAVETA_SERVE_HOST,
      port,
      cliVersion: cliVersion(),
      ...(webReady ? { webRoot: resolveWebDistRoot() } : {}),
    });
    const address = await server.listen();
    const data = {
      host: address.host,
      port: address.port,
      url: address.url,
      token: address.token,
      webViewer: webReady,
    };
    const human = webReady
      ? `Servidor local en ${address.url}\n`
      : `Servidor local (solo API) en ${address.url}\n`;
    if (context.emit !== undefined) {
      if (context.json) {
        context.emit.success(data, warnings);
      } else {
        context.emit.stdout(human);
      }
    }
    await server.waitForShutdown();
    return {
      data,
      human: '',
      deferSuccessOutput: true,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
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
