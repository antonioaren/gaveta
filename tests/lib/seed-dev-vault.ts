import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { initVault, openVaultIndex } from '@gaveta/core';

export const SEED_VERSION = 1;
export const DEFAULT_DEV_VAULT_DIR = '.dev-vault';

/** Relative note paths the seed must produce (stable across runs). */
export const SEED_NOTE_PATHS = [
  'bienvenida.html',
  'guia-rapida.html',
  'componentes-ui.html',
  'red-conocimiento.html',
  'presentacion-producto.html',
  'panel-metricas.html',
  'landing-ejemplo.html',
  'lista-tareas-equipo.html',
  'nota-con-imagen.html',
  'manual-de-estilo.html',
  'proyectos/equipo/ninos-en-espana.html',
] as const;

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const GAVETA_BIN = join(REPO_ROOT, 'packages/cli/bin/gaveta.js');
const CLAUDE_FIXTURES = join(REPO_ROOT, 'fixtures/claude');
const PIXEL_FIXTURE = join(REPO_ROOT, 'fixtures/vaults/backlinks/attachments/pixel.png');
const SHOWCASE_DOC = join(REPO_ROOT, 'fixtures/showcase/vitrina-doc.html');

function runGaveta(args: readonly string[], vaultRoot: string): string {
  const result = spawnSync(process.execPath, [GAVETA_BIN, ...args, '--vault', vaultRoot], {
    cwd: vaultRoot,
    encoding: 'utf8',
    env: { ...process.env, GAVETA_VAULT: vaultRoot },
  });
  if (result.status !== 0) {
    throw new Error(
      `gaveta ${args.join(' ')} failed (${String(result.status)}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function createNote(
  vaultRoot: string,
  title: string,
  type: 'doc' | 'slides' | 'todo',
  articleInner: string,
  destRelative: string,
  folder?: string,
): void {
  const args = ['new', title, '--type', type, '--tags', 'demo', '--from', '-', '--json'];
  if (folder !== undefined) {
    args.push('--in', folder);
  }
  const result = spawnSync(process.execPath, [GAVETA_BIN, ...args, '--vault', vaultRoot], {
    cwd: vaultRoot,
    input: articleInner,
    encoding: 'utf8',
    env: { ...process.env, GAVETA_VAULT: vaultRoot },
  });
  if (result.status !== 0) {
    throw new Error(`gaveta new "${title}" failed: ${result.stderr || result.stdout}`);
  }
  const envelope = JSON.parse(result.stdout) as { data?: { path?: string } };
  const produced = envelope.data?.path;
  if (produced === undefined) {
    throw new Error(`gaveta new "${title}" missing path`);
  }
  const destAbs = join(vaultRoot, destRelative);
  mkdirSync(dirname(destAbs), { recursive: true });
  const producedAbs = join(vaultRoot, produced);
  if (producedAbs !== destAbs) {
    rmSync(destAbs, { force: true });
    renameSync(producedAbs, destAbs);
  }
}

function adoptToPath(
  vaultRoot: string,
  fixtureName: string,
  destRelative: string,
  extraArgs: readonly string[] = [],
): void {
  const stagingDir = join(vaultRoot, '.seed-staging');
  mkdirSync(stagingDir, { recursive: true });
  const staging = join(stagingDir, fixtureName);
  copyFileSync(join(CLAUDE_FIXTURES, fixtureName), staging);
  const stdout = runGaveta(
    ['adopt', staging, '--source', 'claude', ...extraArgs, '--json'],
    vaultRoot,
  );
  const envelope = JSON.parse(stdout) as { data?: { path?: string } };
  const produced = envelope.data?.path;
  if (produced === undefined) {
    throw new Error(`adopt ${fixtureName} missing path in JSON`);
  }
  const destAbs = join(vaultRoot, destRelative);
  mkdirSync(join(destAbs, '..'), { recursive: true });
  const producedAbs = join(vaultRoot, produced);
  if (producedAbs !== destAbs) {
    rmSync(destAbs, { force: true });
    renameSync(producedAbs, destAbs);
  }
  fixThemeStylesheetHref(vaultRoot, destRelative);
}

function fixThemeStylesheetHref(vaultRoot: string, relativePath: string): void {
  const absolute = join(vaultRoot, relativePath);
  const html = readFileSync(absolute, 'utf8');
  const fixed = html.replaceAll('href="../.gaveta/theme.css"', 'href=".gaveta/theme.css"');
  if (fixed !== html) {
    writeFileSync(absolute, fixed, 'utf8');
  }
}

/** Idempotent: ensures vault exists and overwrites the known seed notes. */
export async function seedDevVault(vaultRoot: string): Promise<void> {
  const absolute = vaultRoot.startsWith('/') ? vaultRoot : join(process.cwd(), vaultRoot);
  mkdirSync(absolute, { recursive: true });
  if (!existsSync(join(absolute, '.gaveta', 'config.json'))) {
    await initVault({ cwd: absolute });
  }

  for (const relative of SEED_NOTE_PATHS) {
    rmSync(join(absolute, relative), { force: true });
  }
  rmSync(join(absolute, '.seed-staging'), { recursive: true, force: true });

  mkdirSync(join(absolute, 'attachments'), { recursive: true });
  copyFileSync(PIXEL_FIXTURE, join(absolute, 'attachments', 'pixel.png'));

  createNote(
    absolute,
    'Bienvenida a Gaveta',
    'doc',
    `<article>
      <h1>Bienvenida a Gaveta</h1>
      <section id="intro">
        <p>Vault de demostración para explorar la app sin configurar nada.</p>
        <ul>
          <li>Notas HTML con enlaces y etiquetas</li>
          <li>Tipos <code>doc</code>, <code>slides</code>, <code>dashboard</code> y más</li>
          <li>Grafo global y búsqueda rápida</li>
        </ul>
      </section>
    </article>`,
    'bienvenida.html',
  );

  createNote(
    absolute,
    'Guía rápida',
    'doc',
    `<article>
      <h1>Guía rápida</h1>
      <section id="pasos">
        <h2>Pasos</h2>
        <ol>
          <li>Inicializa un vault con <code>gaveta init</code></li>
          <li>Crea notas con <code>gaveta new</code></li>
          <li>Sirve la app con <code>gaveta serve</code></li>
        </ol>
        <pre><code class="language-bash">pnpm exec gaveta serve --json</code></pre>
      </section>
    </article>`,
    'guia-rapida.html',
  );

  createNote(
    absolute,
    'Componentes UI',
    'doc',
    `<article>
      <h1>Componentes UI</h1>
      <section id="avisos">
        <aside class="callout" data-kind="tip"><p>Consejo: usa callouts para resaltar ideas.</p></aside>
        <aside class="callout" data-kind="warning"><p>Advertencia de ejemplo.</p></aside>
      </section>
      <section id="tabla">
        <h2>Tabla de ejemplo</h2>
        <table>
          <thead><tr><th>Columna</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>Latencia</td><td>Baja</td></tr>
            <tr><td>Modo</td><td>Local</td></tr>
          </tbody>
        </table>
      </section>
    </article>`,
    'componentes-ui.html',
  );

  adoptToPath(absolute, 'slides.html', 'presentacion-producto.html', ['--as', 'slides']);
  adoptToPath(absolute, 'dashboard.html', 'panel-metricas.html', ['--as', 'dashboard']);
  adoptToPath(absolute, 'design.html', 'landing-ejemplo.html', ['--as', 'design']);

  createNote(
    absolute,
    'Lista de tareas del equipo',
    'todo',
    `<article>
      <h1>Lista de tareas del equipo</h1>
      <ul class="tasks">
        <li data-g-task id="revisar-seed"><input type="checkbox" /> Revisar el vault de demo</li>
        <li data-g-task id="capturas"><input type="checkbox" checked /> Tomar capturas de la UI</li>
      </ul>
    </article>`,
    'lista-tareas-equipo.html',
  );

  createNote(
    absolute,
    'Nota con imagen',
    'doc',
    `<article>
      <h1>Nota con imagen</h1>
      <section id="media">
        <p>Adjunto local embebido:</p>
        <img src="attachments/pixel.png" alt="Pixel de muestra" width="16" height="16" />
      </section>
    </article>`,
    'nota-con-imagen.html',
  );

  const manualStaging = join(absolute, '.seed-staging', 'vitrina-doc.html');
  mkdirSync(join(manualStaging, '..'), { recursive: true });
  copyFileSync(SHOWCASE_DOC, manualStaging);
  const manualStdout = runGaveta(
    ['adopt', manualStaging, '--source', 'claude', '--as', 'doc', '--json'],
    absolute,
  );
  const manualPath = (JSON.parse(manualStdout) as { data?: { path?: string } }).data?.path;
  if (manualPath !== undefined) {
    const manualDest = join(absolute, 'manual-de-estilo.html');
    rmSync(manualDest, { force: true });
    renameSync(join(absolute, manualPath), manualDest);
    fixThemeStylesheetHref(absolute, 'manual-de-estilo.html');
  }

  runGaveta(['reindex', '--json'], absolute);

  createNote(
    absolute,
    'Red de conocimiento',
    'doc',
    `<article>
      <h1>Red de conocimiento</h1>
      <section id="enlaces">
        <p>Explora [[Guía rápida]], [[Componentes UI]] y [[Roadmap 2026]].</p>
      </section>
    </article>`,
    'red-conocimiento.html',
  );

  createNote(
    absolute,
    'Niños en España',
    'doc',
    `<article>
      <h1>Niños en España</h1>
      <section id="acentos">
        <p>Prueba de tildes: organización, cañón, pingüino.</p>
        <p>Enlace: [[Bienvenida a Gaveta]]</p>
      </section>
    </article>`,
    'proyectos/equipo/ninos-en-espana.html',
    'proyectos/equipo',
  );

  runGaveta(['reindex', '--json'], absolute);

  const index = await openVaultIndex(absolute);
  try {
    const recovery = index.recovery();
    if (recovery !== null) {
      throw new Error(`index recovery required after seed: ${recovery}`);
    }
  } finally {
    index.close();
  }

  writeFileSync(
    join(absolute, '.gaveta', 'seed-version.json'),
    JSON.stringify({ version: SEED_VERSION, paths: SEED_NOTE_PATHS }, null, 2),
    'utf8',
  );
}

export function resolveSeedVaultRoot(arg?: string): string {
  return arg === undefined || arg.length === 0 ? DEFAULT_DEV_VAULT_DIR : arg;
}
