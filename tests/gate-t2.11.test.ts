import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(REPO_ROOT, 'scripts/gate-t2.11.sh');

it('gate-t2.11.sh --check prepares a demo vault and passes smoke checks', () => {
  const vault = mkdtempSync(join(tmpdir(), 'gaveta-gate-t2.11-test-'));
  try {
    execFileSync('bash', [SCRIPT, '--check'], {
      cwd: REPO_ROOT,
      env: { ...process.env, GAVETA_GATE_VAULT: vault },
      stdio: 'pipe',
      encoding: 'utf8',
    });
    expect(existsSync(join(vault, 'vitrina-doc.html'))).toBe(true);
    expect(existsSync(join(vault, 'importados/tareas/tareas-basicas.html'))).toBe(true);
    expect(existsSync(join(vault, 'importados/salud/nota-rota.html'))).toBe(true);
    expect(existsSync(join(vault, 'importados/artefactos/panel-kpi-demo.html'))).toBe(true);
    expect(existsSync(join(vault, 'importados/demo/recarga-en-vivo.html'))).toBe(true);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
}, 120_000);
