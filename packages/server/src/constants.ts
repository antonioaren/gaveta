/** Local bind address for gaveta serve (REQ-CLI-12, REQ-SEC-06). */
export const GAVETA_SERVE_HOST = '127.0.0.1';

/** Default TCP port when --port is omitted. */
export const GAVETA_SERVE_DEFAULT_PORT = 3847;

/** API JSON envelope version (matches CLI schemaVersion). */
export const API_SCHEMA_VERSION = 1;

/** Header carrying the per-session token (also accepts Authorization: Bearer). */
export const GAVETA_TOKEN_HEADER = 'x-gaveta-token';
