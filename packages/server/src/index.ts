import { CORE_PACKAGE_ID } from '@gaveta/core';

/** Package id. */
export const SERVER_PACKAGE_ID = '@gaveta/server';

/** Core package linked by the server. */
export const LINKED_CORE_PACKAGE_ID = CORE_PACKAGE_ID;

export {
  API_SCHEMA_VERSION,
  GAVETA_SERVE_DEFAULT_PORT,
  GAVETA_SERVE_HOST,
  GAVETA_TOKEN_HEADER,
} from './constants.ts';

export {
  createGavetaServer,
  type CreateGavetaServerOptions,
  type GavetaServer,
  type GavetaServerAddress,
} from './create-server.ts';

export { buildAppUrl, createSessionToken } from './auth.ts';
