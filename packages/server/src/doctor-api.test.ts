import { cpSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vaultPath } from '@gaveta/fixtures';
import { expect, it } from 'vitest';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';

it('returns doctor findings with severity and note ids', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-doctor-api-'));
  const vaultRoot = join(parent, 'vault');
  cpSync(vaultPath('problems'), vaultRoot, { recursive: true });
  try {
    const token = 'doctor-api-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const headers = { [GAVETA_TOKEN_HEADER]: token };
    const denied = await requestLocal(address.port, '/api/doctor', {});
    expect(denied.status).toBe(401);
    const response = await requestLocal(address.port, '/api/doctor', headers);
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as {
      data: {
        ok: boolean;
        findings: { code: string; severity: string; noteId: string | null; path: string }[];
      };
    };
    expect(body.data.ok).toBe(false);
    const broken = body.data.findings.find((finding) => finding.code === 'E_LINK_BROKEN');
    expect(broken?.severity).toBe('error');
    expect(broken?.path).toBe('nota-rota.html');
    expect(broken?.noteId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/u);
    await server.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('never applies fixes on GET even when fix=true is sent', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-doctor-readonly-'));
  const vaultRoot = join(parent, 'vault');
  cpSync(vaultPath('problems'), vaultRoot, { recursive: true });
  try {
    const token = 'doctor-readonly-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const headers = { [GAVETA_TOKEN_HEADER]: token };
    const baseline = await requestLocal(address.port, '/api/doctor', headers);
    expect(baseline.status).toBe(200);
    const stalePath = join(vaultRoot, 'href-desfasado.html');
    const htmlBefore = readFileSync(stalePath, 'utf8');
    const indexPath = join(vaultRoot, '.gaveta/index.sqlite');
    const indexBefore = statSync(indexPath);

    const withFix = await requestLocal(address.port, '/api/doctor?fix=true', headers);
    expect(withFix.status).toBe(200);
    const body = JSON.parse(withFix.body) as {
      data: {
        findings: { code: string }[];
        fixed: unknown[];
      };
    };
    expect(body.data.fixed).toEqual([]);
    expect(body.data.findings.some((finding) => finding.code === 'W_LINK_HREF_STALE')).toBe(true);
    expect(readFileSync(stalePath, 'utf8')).toBe(htmlBefore);
    const indexAfter = statSync(indexPath);
    expect(indexAfter.mtimeMs).toBe(indexBefore.mtimeMs);
    expect(indexAfter.size).toBe(indexBefore.size);
    await server.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('rejects traversal in unrelated routes while doctor stays allowlisted', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'doctor-path-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const headers = { [GAVETA_TOKEN_HEADER]: token };
    const traversal = await requestLocal(address.port, '/api/%2e%2e/notes', headers);
    expect(traversal.status).toBe(400);
    const doctor = await requestLocal(address.port, '/api/doctor', headers);
    expect(doctor.status).toBe(200);
    await server.close();
  });
});
