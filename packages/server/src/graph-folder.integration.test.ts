import { expect, it } from 'vitest';
import { GAVETA_TOKEN_HEADER } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';

function authHeaders(token: string): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
  };
}

function pathsFromGraph(body: string): string[] {
  const parsed = JSON.parse(body) as {
    data: { nodes: { path: string | null }[] };
  };
  return parsed.data.nodes
    .map((node) => node.path)
    .filter((path): path is string => path !== null)
    .sort();
}

async function expectInvalidFolder(port: number, headers: Record<string, string>, folder: string) {
  const response = await requestLocal(
    port,
    `/api/graph?folder=${encodeURIComponent(folder)}`,
    headers,
  );
  expect(response.status).toBe(400);
  const body = JSON.parse(response.body) as { error: { code: string } };
  expect(body.error.code).toBe('E_ARG_INVALID');
}

it('filters global graph by folder segment prefix via the API', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'graph-folder-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const port = address.port;
    const headers = authHeaders(token);

    const all = await requestLocal(port, '/api/graph', headers);
    expect(all.status).toBe(200);
    const allPaths = pathsFromGraph(all.body);

    const enlaces = await requestLocal(port, '/api/graph?folder=enlaces', headers);
    expect(enlaces.status).toBe(200);
    const enlacesPaths = pathsFromGraph(enlaces.body);
    expect(enlacesPaths.length).toBeGreaterThan(0);
    expect(enlacesPaths.every((path) => path.startsWith('enlaces/'))).toBe(true);
    expect(enlacesPaths.length).toBeLessThan(allPaths.length);
    expect(enlacesPaths).not.toContain('destino-enlace.html');

    await server.close();
  });
});

it('rejects invalid folder query values with E_ARG_INVALID', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'graph-folder-invalid';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const port = address.port;
    const headers = authHeaders(token);

    await expectInvalidFolder(port, headers, ' ');
    await expectInvalidFolder(port, headers, '/enlaces');
    await expectInvalidFolder(port, headers, '..');
    await expectInvalidFolder(port, headers, 'enlaces/../x');

    await server.close();
  });
});
