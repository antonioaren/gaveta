import { expect, it } from 'vitest';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';

function authHeaders(token: string): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
  };
}

it('serves read, links, backlinks, graph, search, and doctor', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'integration-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const port = address.port;
    const headers = authHeaders(token);

    const notes = await requestLocal(port, '/api/notes', headers);
    expect(notes.status).toBe(200);

    const notesBody = JSON.parse(notes.body) as { data: { notes: { title: string }[] } };
    const first = notesBody.data.notes[0];
    if (first === undefined) {
      throw new Error('expected at least one note');
    }
    const ref = encodeURIComponent(first.title);

    const read = await requestLocal(port, `/api/read?ref=${ref}&as=outline`, headers);
    expect(read.status).toBe(200);
    const readBody = JSON.parse(read.body) as { data: { hash: string } };
    expect(readBody.data.hash).toMatch(/^sha256:/);

    const links = await requestLocal(port, `/api/links?ref=${ref}`, headers);
    expect(links.status).toBe(200);

    const backlinks = await requestLocal(port, `/api/backlinks?ref=${ref}`, headers);
    expect(backlinks.status).toBe(200);

    const graph = await requestLocal(port, '/api/graph', headers);
    expect(graph.status).toBe(200);
    const graphBody = JSON.parse(graph.body) as { data: { nodes: unknown[] } };
    expect(graphBody.data.nodes.length).toBeGreaterThan(0);

    const search = await requestLocal(port, '/api/search?q=Gaveta', headers);
    expect(search.status).toBe(200);

    const doctor = await requestLocal(port, '/api/doctor', headers);
    expect(doctor.status).toBe(200);
    const doctorBody = JSON.parse(doctor.body) as { data: { ok: boolean } };
    expect(doctorBody.data).toHaveProperty('ok');

    await server.close();
  });
});
