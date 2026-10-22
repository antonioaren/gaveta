import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DUPLICATE_ID, GHOST_TITLE, MISSING_ID, vaultPath, type VaultName } from '@gaveta/fixtures';
import { doctorVault } from './doctor.ts';

async function withFixture(name: VaultName, run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-doctor-'));
  try {
    const root = join(parent, name);
    await cp(vaultPath(name), root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function countCode(findings: readonly { code: string }[], code: string): number {
  return findings.filter((finding) => finding.code === code).length;
}

describe('doctorVault (REQ-LINK-11)', () => {
  it('reports exactly one finding per problem type in the problems vault', async () => {
    await withFixture('problems', async (root) => {
      const report = await doctorVault(root);
      expect(report.ok).toBe(false);
      expect(countCode(report.findings, 'E_LINK_BROKEN')).toBe(1);
      expect(countCode(report.findings, 'W_LINK_PENDING')).toBe(1);
      expect(countCode(report.findings, 'W_NOTE_ORPHAN')).toBe(1);
      expect(countCode(report.findings, 'E_ID_DUPLICATE')).toBe(1);
      expect(countCode(report.findings, 'E_TASK_INVALID')).toBe(1);
      expect(countCode(report.findings, 'W_LINK_HREF_STALE')).toBe(1);
      expect(countCode(report.findings, 'W_THEME_HREF')).toBe(1);

      const broken = report.findings.find((finding) => finding.code === 'E_LINK_BROKEN');
      expect(broken).toMatchObject({
        path: 'nota-rota.html',
        details: { targetId: MISSING_ID, href: 'no-existe.html' },
      });

      const pending = report.findings.find((finding) => finding.code === 'W_LINK_PENDING');
      expect(pending).toMatchObject({
        path: 'nota-pendiente.html',
        details: { title: GHOST_TITLE },
      });

      const orphan = report.findings.find((finding) => finding.code === 'W_NOTE_ORPHAN');
      expect(orphan).toMatchObject({ path: 'nota-huerfana.html' });

      const duplicate = report.findings.find((finding) => finding.code === 'E_ID_DUPLICATE');
      expect(duplicate?.details?.id).toBe(DUPLICATE_ID);
      expect(duplicate?.details?.paths).toBe('dup/duplicado-alfa.html,dup/duplicado-beta.html');

      const stale = report.findings.find((finding) => finding.code === 'W_LINK_HREF_STALE');
      expect(stale).toMatchObject({
        path: 'href-desfasado.html',
        details: { href: 'ruta-incorrecta.html', target: 'nota-destino.html' },
      });

      const theme = report.findings.find((finding) => finding.code === 'W_THEME_HREF');
      expect(theme).toMatchObject({
        path: 'anidada/ruta-del-tema.html',
        details: { href: '.gaveta/theme.css', expected: '../.gaveta/theme.css' },
      });
    });
  });

  it('repairs stale href and theme with --fix and stays idempotent', async () => {
    await withFixture('problems', async (root) => {
      const first = await doctorVault(root, { fix: true });
      expect(first.fixed.map((item) => item.path).sort()).toEqual([
        'anidada/ruta-del-tema.html',
        'href-desfasado.html',
      ]);
      expect(countCode(first.findings, 'W_LINK_HREF_STALE')).toBe(0);
      expect(countCode(first.findings, 'W_THEME_HREF')).toBe(0);
      expect(countCode(first.findings, 'E_LINK_BROKEN')).toBe(1);

      const hrefHtml = await readFile(join(root, 'href-desfasado.html'), 'utf8');
      expect(hrefHtml).toContain('href="nota-destino.html"');
      expect(hrefHtml).not.toContain('ruta-incorrecta.html');

      const themeHtml = await readFile(join(root, 'anidada/ruta-del-tema.html'), 'utf8');
      expect(themeHtml).toContain('href="../.gaveta/theme.css"');

      const second = await doctorVault(root, { fix: true });
      expect(second.fixed).toEqual([]);
      expect(countCode(second.findings, 'W_LINK_HREF_STALE')).toBe(0);
      expect(countCode(second.findings, 'W_THEME_HREF')).toBe(0);
    });
  });

  it('accepts the empty vault', async () => {
    await withFixture('empty', async (root) => {
      const report = await doctorVault(root);
      expect(report.ok).toBe(true);
      expect(report.findings).toEqual([]);
      expect(report.fixed).toEqual([]);
    });
  });
});
