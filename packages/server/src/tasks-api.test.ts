import { expect, it } from 'vitest';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';

function authHeaders(token: string): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
  };
}

it('lists vault tasks with due and priority filters', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'tasks-api-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const port = address.port;
    const headers = authHeaders(token);

    const all = await requestLocal(port, '/api/tasks', headers);
    expect(all.status).toBe(200);
    const allBody = JSON.parse(all.body) as {
      data: { tasks: { taskId: string | null }[] };
    };
    expect(allBody.data.tasks.some((task) => task.taskId === 'revisar')).toBe(true);

    const filtered = await requestLocal(
      port,
      '/api/tasks?priority=medium&dueOn=2026-10-22',
      headers,
    );
    expect(filtered.status).toBe(200);
    const filteredBody = JSON.parse(filtered.body) as {
      data: { tasks: { taskId: string | null; noteTitle: string }[] };
    };
    expect(filteredBody.data.tasks).toHaveLength(1);
    expect(filteredBody.data.tasks[0]?.taskId).toBe('revisar');
    expect(filteredBody.data.tasks[0]?.noteTitle.length).toBeGreaterThan(0);

    await server.close();
  });
});
