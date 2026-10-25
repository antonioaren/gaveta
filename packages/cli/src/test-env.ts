/** Default CLI locale for unit tests that assert on Spanish copy. */
export function cliTestEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { GAVETA_LANG: 'es', ...overrides };
}
