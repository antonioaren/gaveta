import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { initVault, parseJson, runGaveta, withTempVault } from './helpers.ts';

it('REQ-TYPE-07: gaveta new applies .gaveta/templates/<type>.html', () => {
  withTempVault((vault) => {
    initVault(vault);
    const templatesDir = join(vault, '.gaveta', 'templates');
    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(
      join(templatesDir, 'doc.html'),
      '<article><h1>{{title}}</h1><p data-g-template-marker="cli">CLI template</p></article>\n',
      'utf8',
    );
    const result = runGaveta(['new', 'Desde plantilla', '--type', 'doc', '--json'], { cwd: vault });
    expect(result.status).toBe(0);
    const path = (parseJson(result.stdout).data as { path: string }).path;
    const html = readFileSync(join(vault, path), 'utf8');
    expect(html).toContain('data-g-template-marker="cli"');
    expect(html).toContain('Desde plantilla');
  });
});
