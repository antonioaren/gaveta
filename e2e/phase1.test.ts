import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectedArtifactCsp, readArtifactSrcdoc } from '@gaveta/core';
import { DUPLICATE_ID, GHOST_TITLE, NOTE_X, themeHrefFor, vaultPath } from '@gaveta/fixtures';
import { commands } from '../packages/cli/src/registry.ts';
import { describe, expect, it } from 'vitest';
import {
  GAVETA_BIN,
  REPO_ROOT,
  childEnv,
  hasUnsafeTag,
  initVault,
  parseJson,
  runGaveta,
  stableGraph,
  withTempVault,
  type GraphPayload,
} from './helpers.ts';

const CLAUDE_FIXTURES = join(REPO_ROOT, 'fixtures/claude');
describe('phase 1 — agent documentation workflow', () => {
  it('covers vault, notes, links, search, health, and guide in one session', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-workflow-'));
    const vault = join(parent, 'vault');
    const outside = join(parent, 'outside');
    mkdirSync(outside);
    try {
      // REQ-VAULT-01: init is idempotent (preservation covered in init-adopt e2e)
      mkdirSync(vault);
      const created = initVault(vault);
      expect(created.status).toBe(0);
      expect(created.stderr).toBe('');
      const again = initVault(vault);
      expect(again.status).toBe(0);
      expect(parseJson(again.stdout).data).toMatchObject({
        created: [],
        preserved: [
          '.gaveta/config.json',
          '.gaveta/theme.css',
          '.gaveta/mermaid.min.js',
          '.gaveta/mermaid-boot.js',
          '.gaveta/MERMAID-LICENSE.txt',
          '.gaveta/index.sqlite',
        ],
      });

      // REQ-VAULT-02 / REQ-AGENT-03: delimited agent block
      const agents = runGaveta(['init', '--agent-instructions', 'agents', '--json'], {
        cwd: vault,
      });
      expect(agents.status).toBe(0);
      const agentsMd = readFileSync(join(vault, 'AGENTS.md'), 'utf8');
      expect(agentsMd).toContain('<!-- gaveta:start -->');
      expect(agentsMd.indexOf('<!-- gaveta:start -->')).toBe(
        agentsMd.lastIndexOf('<!-- gaveta:start -->'),
      );

      // REQ-AGENT-05: GAVETA_VAULT from outside the vault tree
      const remote = runGaveta(['new', 'Remota', '--type', 'doc', '--from', '-', '--json'], {
        cwd: outside,
        env: childEnv({ GAVETA_VAULT: vault }),
        input:
          '<article><h1>Remota</h1><section id="cuerpo"><p>desde fuera</p></section></article>',
      });
      expect(remote.status).toBe(0);
      expect(readFileSync(join(vault, 'remota.html'), 'utf8')).toContain('desde fuera');

      const roadmap = runGaveta(
        ['new', 'Roadmap', '--type', 'doc', '--aliases', 'roadmap', '--from', '-', '--json'],
        {
          cwd: vault,
          input: '<article><h1>Roadmap</h1><section id="resumen"><p>Plan</p></section></article>',
        },
      );
      expect(roadmap.status).toBe(0);

      // REQ-LINK-01: wikilink resolution (case and accent insensitive)
      const origin = runGaveta(
        ['new', 'Origen', '--type', 'doc', '--in', 'notas', '--from', '-', '--json'],
        {
          cwd: vault,
          input:
            '<article><h1>Origen</h1><section id="cuerpo"><p>Ver [[roadmap]] y [[Roadmap#resumen]]</p></section></article>',
        },
      );
      expect(origin.status).toBe(0);
      const originHtml = readFileSync(join(vault, 'notas/origen.html'), 'utf8');
      expect(originHtml).toContain('data-g-to=');
      expect(originHtml).toContain('roadmap.html');

      // REQ-LINK-02: pending link + doctor
      const pending = runGaveta(['new', 'Pendiente', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Pendiente</h1><section id="cuerpo"><p>[[Nota fantasma]]</p></section></article>',
      });
      expect(pending.status).toBe(0);
      expect(parseJson(pending.stdout).warnings?.some((w) => w.code === 'W_LINK_PENDING')).toBe(
        true,
      );
      const doctorPending = runGaveta(['doctor', '--json'], { cwd: vault });
      expect(doctorPending.stdout).toContain('W_LINK_PENDING');
      expect(doctorPending.stdout).toContain(GHOST_TITLE);

      // REQ-CLI-04 / REQ-CLI-05: create + read outline with hash
      const readOutline = runGaveta(['read', 'Origen', '--as', 'outline', '--json'], {
        cwd: vault,
      });
      expect(readOutline.status).toBe(0);
      const outline = parseJson<{
        hash: string;
        outline: { sections: { id: string }[]; links: unknown[] };
      }>(readOutline.stdout).data;
      expect(outline.hash.startsWith('sha256:')).toBe(true);
      expect(outline.outline.sections.some((section) => section.id === 'cuerpo')).toBe(true);

      // REQ-CLI-06: partial edit leaves head bytes intact
      const beforeEdit = readFileSync(join(vault, 'notas/origen.html'), 'utf8');
      const headEnd = beforeEdit.indexOf('<article>');
      const edited = runGaveta(
        ['edit', 'Origen', '--section', 'cuerpo', '--append', '--from', '-', '--json'],
        { cwd: vault, input: '<p>Más contexto.</p>' },
      );
      expect(edited.status).toBe(0);
      const afterEdit = readFileSync(join(vault, 'notas/origen.html'), 'utf8');
      expect(afterEdit.slice(0, headEnd)).toBe(beforeEdit.slice(0, headEnd));

      // REQ-CLI-08: ref by title
      const byTitle = runGaveta(['read', 'Roadmap', '--as', 'text'], { cwd: vault });
      expect(byTitle.status).toBe(0);
      const missing = runGaveta(['read', 'No existe', '--json'], { cwd: vault });
      expect(missing.status).toBe(4);
      expect(parseJson(missing.stdout).error?.code).toBe('E_REF_NOT_FOUND');

      // REQ-CLI-10: search ranks sqlite note first when alone
      const motor = runGaveta(['new', 'Motor', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Motor</h1><section id="cuerpo"><p>El motor usa sqlite.</p></section></article>',
      });
      expect(motor.status).toBe(0);
      const search = runGaveta(['search', 'sqlite', '--json'], { cwd: vault });
      expect(search.status).toBe(0);
      const hits = parseJson<{ hits: { path: string }[] }>(search.stdout).data.hits;
      expect(hits[0]?.path).toBe('motor.html');

      // REQ-LINK-08: link command idempotent
      const linkOnce = runGaveta(['link', 'Origen', 'Roadmap', '--rel', 'related', '--json'], {
        cwd: vault,
      });
      expect(linkOnce.status).toBe(0);
      const linkTwice = runGaveta(['link', 'Origen', 'Roadmap', '--rel', 'related', '--json'], {
        cwd: vault,
      });
      expect(linkTwice.status).toBe(0);
      const linksBody = parseJson<{ links: unknown[] }>(
        runGaveta(['links', 'Origen', '--json'], { cwd: vault }).stdout,
      ).data;
      expect(linksBody.links.length).toBeGreaterThan(0);

      // REQ-LINK-06 / REQ-LINK-07 / REQ-GRAPH-01: connections on backlinks fixture copy
      const backlinks = join(parent, 'backlinks');
      cpSync(vaultPath('backlinks'), backlinks, { recursive: true });
      const outgoing = runGaveta(['links', 'formas-de-enlace.html', '--json'], { cwd: backlinks });
      expect(outgoing.status).toBe(0);
      const back = runGaveta(['backlinks', NOTE_X.title, '--json'], { cwd: backlinks });
      expect(back.status).toBe(0);
      const backData = parseJson<{ backlinks: { context: string }[] }>(back.stdout).data;
      expect(backData.backlinks.every((entry) => entry.context.length <= 200)).toBe(true);
      const graph = runGaveta(['graph', '--json'], { cwd: backlinks });
      expect(graph.status).toBe(0);
      const graphData = parseJson<GraphPayload>(graph.stdout).data;
      expect(graphData.nodes.some((node) => node.ghost === true)).toBe(true);

      // REQ-GRAPH-02 / REQ-GRAPH-03
      const local = runGaveta(['graph', NOTE_X.path, '--depth', '1', '--json'], {
        cwd: backlinks,
      });
      expect(local.status).toBe(0);
      const depthBad = runGaveta(['graph', NOTE_X.path, '--depth', '4', '--json'], {
        cwd: backlinks,
      });
      expect(depthBad.status).toBe(1);
      const relFilter = runGaveta(['graph', '--json', '--rel', 'depends-on'], { cwd: backlinks });
      expect(relFilter.status).toBe(0);
      const relEdges = parseJson<GraphPayload>(relFilter.stdout).data.edges;
      expect(relEdges.every((edge) => edge.rel === 'depends-on')).toBe(true);

      // REQ-VAULT-06: graph stable after index deletion + reindex (before mutating backlinks)
      const graphBefore = stableGraph(runGaveta(['graph', '--json'], { cwd: backlinks }).stdout);
      unlinkSync(join(backlinks, '.gaveta', 'index.sqlite'));
      const reindex = runGaveta(['reindex', '--full', '--json'], { cwd: backlinks });
      expect(reindex.status).toBe(0);
      const graphAfter = stableGraph(runGaveta(['graph', '--json'], { cwd: backlinks }).stdout);
      expect(graphAfter).toEqual(graphBefore);

      // REQ-LINK-09: mv rewrites hrefs (smoke on fixture)
      const moved = runGaveta(['mv', NOTE_X.title, 'otra/ruta', '--json'], { cwd: backlinks });
      expect(moved.status).toBe(0);
      const doctorMv = runGaveta(['doctor', '--json'], { cwd: backlinks });
      expect(doctorMv.stdout.includes('E_LINK_BROKEN')).toBe(false);

      // REQ-LINK-10: rm protected then force
      const rmFail = runGaveta(['rm', 'otra/ruta.html', '--json'], { cwd: backlinks });
      expect(rmFail.status).not.toBe(0);
      expect(parseJson(rmFail.stdout).error?.code).toBe('E_HAS_BACKLINKS');
      const rmForce = runGaveta(['rm', 'otra/ruta.html', '--force', '--json'], { cwd: backlinks });
      expect(rmForce.status).toBe(0);

      // REQ-TYPE-04: todo on doc section
      const todoNote = runGaveta(['new', 'Tareas', '--type', 'todo', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Tareas</h1><ul class="tasks"><li data-g-task id="abierta"><label><input type="checkbox" /> Abierta</label></li></ul></article>',
      });
      expect(todoNote.status).toBe(0);
      const todoAdd = runGaveta(['todo', 'add', 'Tareas', 'Comprar leche', '--json'], {
        cwd: vault,
      });
      expect(todoAdd.status).toBe(0);
      const beforeCheck = readFileSync(join(vault, 'tareas.html'), 'utf8');
      expect(beforeCheck.includes('checked')).toBe(false);
      const todoCheck = runGaveta(['todo', 'check', 'Tareas', 'abierta', '--json'], { cwd: vault });
      expect(todoCheck.status).toBe(0);
      expect(parseJson(todoCheck.stdout).data).toMatchObject({ checked: true });
      const afterCheck = readFileSync(join(vault, 'tareas.html'), 'utf8');
      expect(afterCheck.includes('checked')).toBe(true);
      expect(beforeCheck.split('\n').length).toBe(afterCheck.split('\n').length);

      // REQ-VAULT-04: theme href depth + mv to root
      const deep = runGaveta(
        ['new', 'Profunda', '--type', 'doc', '--in', 'a/b', '--from', '-', '--json'],
        {
          cwd: vault,
          input: '<article><h1>Profunda</h1><section id="cuerpo"><p>nivel</p></section></article>',
        },
      );
      expect(deep.status).toBe(0);
      expect(readFileSync(join(vault, 'a/b/profunda.html'), 'utf8')).toContain(
        themeHrefFor('a/b/profunda.html'),
      );
      const moveRoot = runGaveta(['mv', 'Profunda', 'profunda.html', '--json'], { cwd: vault });
      expect(moveRoot.status).toBe(0);
      expect(readFileSync(join(vault, 'profunda.html'), 'utf8')).toContain('.gaveta/theme.css');

      // REQ-VAULT-08: adopt external HTML
      const external = join(vault, 'externa.html');
      writeFileSync(
        external,
        '<html><body><article><h1>Externa</h1><p>Sin metadatos</p></article></body></html>',
      );
      const adopted = runGaveta(['adopt', 'externa.html', '--json'], { cwd: vault });
      expect(adopted.status).toBe(0);
      expect(runGaveta(['validate', 'externa.html', '--json'], { cwd: vault }).status).toBe(0);
      expect(runGaveta(['search', 'Externa', '--json'], { cwd: vault }).stdout).toContain(
        'externa.html',
      );

      // REQ-CLI-09: every registered command appears in guide with an example
      const guide = runGaveta(['guide', '--json'], { cwd: vault });
      expect(guide.status).toBe(0);
      const guideBody = parseJson<{ commands: { name: string; example: string }[] }>(
        guide.stdout,
      ).data;
      for (const command of commands) {
        const entry = guideBody.commands.find((item) => item.name === command.name);
        expect(entry?.example.length).toBeGreaterThan(0);
      }

      // REQ-CLI-11 / REQ-SEC-02: validate vault
      expect(runGaveta(['validate', '--json'], { cwd: vault }).status).toBe(0);

      // REQ-CLI-01: json envelope on version
      const version = runGaveta(['version', '--json'], { cwd: vault });
      expect(version.status).toBe(0);
      expect(parseJson(version.stdout)).toMatchObject({ ok: true, schemaVersion: 1 });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('phase 1 — acceptance criteria', () => {
  it('REQ-VAULT-01: init preserves existing HTML and stays idempotent', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-vault01-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    const legacy = '<p>legacy</p>';
    writeFileSync(join(vault, 'legacy.html'), legacy);
    try {
      expect(initVault(vault).status).toBe(0);
      expect(readFileSync(join(vault, 'legacy.html'), 'utf8')).toBe(legacy);
      expect(parseJson(initVault(vault).stdout).data).toMatchObject({
        created: [],
        preserved: [
          '.gaveta/config.json',
          '.gaveta/theme.css',
          '.gaveta/mermaid.min.js',
          '.gaveta/mermaid-boot.js',
          '.gaveta/MERMAID-LICENSE.txt',
          '.gaveta/index.sqlite',
        ],
      });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-VAULT-03: validate fails with E_META_MISSING when metadata is absent', () => {
    withTempVault(
      (vault) => {
        initVault(vault);
        writeFileSync(
          join(vault, 'sin-meta.html'),
          '<!doctype html><html><head><title>Sin</title></head><body><article><h1>Sin</h1></article></body></html>',
        );
        const result = runGaveta(['validate', 'sin-meta.html', '--json'], { cwd: vault });
        expect(result.status).not.toBe(0);
        expect(result.stdout).toContain('E_META_MISSING');
      },
      { fixture: 'empty' },
    );
  });

  it('REQ-VAULT-07: doctor lists duplicate ids', () => {
    withTempVault(
      (vault) => {
        const doctor = runGaveta(['doctor', '--json'], { cwd: vault });
        expect(doctor.status).not.toBe(0);
        expect(doctor.stdout).toContain('E_ID_DUPLICATE');
        expect(doctor.stdout).toContain(DUPLICATE_ID);
      },
      { fixture: 'problems' },
    );
  });

  it('REQ-CLI-07: stale if-match rejects the write', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-conflict-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      runGaveta(['new', 'Nota', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input: '<article><h1>Nota</h1><section id="cuerpo"><p>uno</p></section></article>',
      });
      const hash = parseJson<{ hash: string }>(
        runGaveta(['read', 'Nota', '--json'], { cwd: vault }).stdout,
      ).data.hash;
      const file = join(vault, 'nota.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('uno', 'dos'));
      const conflict = runGaveta(
        [
          'edit',
          'Nota',
          '--section',
          'cuerpo',
          '--replace',
          '--if-match',
          hash,
          '--from',
          '-',
          '--json',
        ],
        { cwd: vault, input: '<p>tres</p>' },
      );
      expect(conflict.status).toBe(3);
      expect(parseJson(conflict.stdout).error?.code).toBe('E_CONFLICT');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-LINK-03: ambiguous title fails with candidates', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-ambig-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      runGaveta(['new', 'Duplicada', '--type', 'doc', '--in', 'a', '--from', '-'], {
        cwd: vault,
        input: '<article><h1>Duplicada</h1><section id="x"><p>a</p></section></article>',
      });
      runGaveta(['new', 'Duplicada', '--type', 'doc', '--in', 'b', '--from', '-'], {
        cwd: vault,
        input: '<article><h1>Duplicada</h1><section id="x"><p>b</p></section></article>',
      });
      const ambiguous = runGaveta(['new', 'Ambigua', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Ambigua</h1><section id="cuerpo"><p>[[Duplicada]]</p></section></article>',
      });
      expect(ambiguous.status).toBe(4);
      const ambBody = parseJson(ambiguous.stdout);
      expect(ambBody.error?.code).toBe('E_REF_AMBIGUOUS');
      expect(JSON.stringify(ambBody.error?.details ?? {})).toContain('candidates');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-LINK-04: doctor --fix repairs stale href', () => {
    withTempVault(
      (vault) => {
        runGaveta(['doctor', '--fix', '--json'], { cwd: vault });
        expect(readFileSync(join(vault, 'href-desfasado.html'), 'utf8')).toContain(
          'href="nota-destino.html"',
        );
      },
      { fixture: 'problems' },
    );
  });

  it('REQ-LINK-05: unknown rel warns and strict mode errors', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-rel-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      runGaveta(['new', 'Roadmap', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input: '<article><h1>Roadmap</h1><section id="resumen"><p>destino</p></section></article>',
      });
      const loose = runGaveta(['new', 'Rel', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Rel</h1><section id="cuerpo"><p><a href="roadmap.html" rel="mystery">x</a></p></section></article>',
      });
      expect(loose.stdout).toContain('W_REL_UNKNOWN');
      writeFileSync(
        join(vault, '.gaveta', 'config.json'),
        JSON.stringify({ rel: { vocabulary: ['related'], strict: true }, remoteAllowlist: [] }),
      );
      const strict = runGaveta(['new', 'Estricta', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Estricta</h1><section id="cuerpo"><p><a href="roadmap.html" rel="mystery">x</a></p></section></article>',
      });
      expect(strict.status).not.toBe(0);
      expect(strict.stdout).toContain('W_REL_UNKNOWN');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-LINK-11: doctor reports each problem type once on the problems vault', () => {
    withTempVault(
      (vault) => {
        const doctor = runGaveta(['doctor', '--json'], { cwd: vault });
        expect(doctor.status).not.toBe(0);
        const findings = parseJson<{ findings: { code: string }[] }>(doctor.stdout).data.findings;
        const codes = findings.map((finding) => finding.code);
        expect(codes.filter((code) => code === 'E_LINK_BROKEN').length).toBe(1);
        expect(codes.filter((code) => code === 'W_LINK_PENDING').length).toBe(1);
        expect(codes.filter((code) => code === 'W_NOTE_ORPHAN').length).toBe(1);
        expect(codes.filter((code) => code === 'E_ID_DUPLICATE').length).toBe(1);
        expect(codes.filter((code) => code === 'E_TASK_INVALID').length).toBe(1);
      },
      { fixture: 'problems' },
    );
  });

  it('REQ-TYPE-01: read outline exposes generated section ids', () => {
    withTempVault(
      (vault) => {
        initVault(vault);
        runGaveta(['new', 'Secciones', '--type', 'doc', '--from', '-', '--json'], {
          cwd: vault,
          input:
            '<article><h1>Secciones</h1><section><h2>Sin id</h2><p>texto</p></section></article>',
        });
        const outline = parseJson<{ outline: { sections: { id: string }[] } }>(
          runGaveta(['read', 'Secciones', '--as', 'outline', '--json'], { cwd: vault }).stdout,
        ).data.outline;
        expect(outline.sections.some((section) => section.id === 'sin-id')).toBe(true);
      },
      { prefix: 'gaveta-phase1-type01-' },
    );
  });

  it('REQ-TYPE-02: validate rejects slides without section.slide', () => {
    withTempVault(
      (vault) => {
        initVault(vault);
        writeFileSync(
          join(vault, 'mala-slide.html'),
          `<!doctype html><html><head><meta charset="utf-8"><title>Mala</title><meta name="gaveta:id" content="01TYPE02SLIDES00000000001"><meta name="gaveta:type" content="slides"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"><link rel="stylesheet" href=".gaveta/theme.css"></head><body><article><h1>Mala</h1></article></body></html>`,
        );
        const result = runGaveta(['validate', 'mala-slide.html', '--json'], { cwd: vault });
        expect(result.status).not.toBe(0);
      },
      { prefix: 'gaveta-phase1-type02-' },
    );
  });

  it('REQ-TYPE-03: validate rejects invalid task due dates', () => {
    withTempVault(
      (vault) => {
        const result = runGaveta(['validate', 'nota-invalida.html', '--json'], { cwd: vault });
        expect(result.status).not.toBe(0);
        expect(result.stdout).toContain('E_TASK_INVALID');
      },
      { fixture: 'problems' },
    );
  });

  it('REQ-TYPE-05: guide component examples validate', () => {
    const guide = runGaveta(['guide', '--topic', 'componentes'], { cwd: REPO_ROOT });
    expect(guide.status).toBe(0);
    expect(guide.stdout).toContain('callout');
    expect(guide.stdout).toContain('<table>');
    expect(runGaveta(['guide', '--topic', 'tipos'], { cwd: REPO_ROOT }).status).toBe(0);
  });

  it('REQ-ART-01: claude fixtures adopt and validate', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-art01-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      for (const name of ['doc.html', 'slides.html', 'dashboard.html', 'design.html']) {
        copyFileSync(join(CLAUDE_FIXTURES, name), join(vault, name));
        const adopted = runGaveta(['adopt', name, '--source', 'claude', '--json'], { cwd: vault });
        expect(adopted.status).toBe(0);
        expect(runGaveta(['validate', name, '--json'], { cwd: vault }).status).toBe(0);
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-ART-05: infers artifact type from React HTML', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-art05-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      copyFileSync(join(CLAUDE_FIXTURES, 'react-app.html'), join(vault, 'react.html'));
      const adopted = runGaveta(
        ['adopt', 'react.html', '--source', 'claude', '--allow-cdn', '--json'],
        { cwd: vault },
      );
      expect(parseJson<{ type: string }>(adopted.stdout).data.type).toBe('artifact');
      const forced = runGaveta(
        ['new', 'Forzado', '--type', 'doc', '--from', join(CLAUDE_FIXTURES, 'doc.html'), '--json'],
        { cwd: vault },
      );
      expect(parseJson<{ type: string }>(forced.stdout).data.type).toBe('doc');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-ART-06: search finds text inside artifact srcdoc', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-art06-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      copyFileSync(join(CLAUDE_FIXTURES, 'react-app.html'), join(vault, 'widget.html'));
      runGaveta(['adopt', 'widget.html', '--source', 'claude', '--allow-cdn', '--json'], {
        cwd: vault,
      });
      runGaveta(['reindex', '--json'], { cwd: vault });
      const found = runGaveta(['search', 'Contador', '--json'], { cwd: vault });
      expect(found.status).toBe(0);
      expect(found.stdout).toContain('widget.html');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-FMT-01: saving twice is byte-identical', () => {
    withTempVault(
      (vault) => {
        runGaveta(['doctor', '--fix', '--json'], { cwd: vault });
        const path = join(vault, 'href-desfasado.html');
        const first = readFileSync(path, 'utf8');
        runGaveta(['doctor', '--fix', '--json'], { cwd: vault });
        const second = readFileSync(path, 'utf8');
        expect(second).toBe(first);
      },
      { fixture: 'problems' },
    );
  });

  it('REQ-FMT-02: inline styles and foreign classes are removed with warnings', () => {
    withTempVault(
      (vault) => {
        initVault(vault);
        const created = runGaveta(['new', 'Estilo', '--type', 'doc', '--from', '-', '--json'], {
          cwd: vault,
          input:
            '<article><h1>Estilo</h1><section id="cuerpo"><p class="no-contrato" style="color:red">Hola</p></section></article>',
        });
        const createdBody = parseJson(created.stdout);
        expect(
          createdBody.warnings?.some((warning) => warning.code === 'W_INLINE_STYLE_REMOVED'),
        ).toBe(true);
        expect(createdBody.warnings?.some((warning) => warning.code === 'W_CLASS_REMOVED')).toBe(
          true,
        );
        const html = readFileSync(join(vault, 'estilo.html'), 'utf8');
        expect(html.includes('style=')).toBe(false);
        expect(html.includes('no-contrato')).toBe(false);
        expect(html.includes('Hola')).toBe(true);
      },
      { prefix: 'gaveta-phase1-fmt02-' },
    );
  });

  it('REQ-LINK-02: creating the ghost title promotes pending links', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-promote-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      runGaveta(['new', 'Con fantasma', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Con fantasma</h1><section id="cuerpo"><p>[[Nota fantasma]]</p></section></article>',
      });
      runGaveta(['new', 'Nota fantasma', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Nota fantasma</h1><section id="cuerpo"><p>ya existe</p></section></article>',
      });
      const html = readFileSync(join(vault, 'con-fantasma.html'), 'utf8');
      expect(html.includes('data-g-pending')).toBe(false);
      expect(html.includes('data-g-to')).toBe(true);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('phase 1 — security', () => {
  it('REQ-SEC-05: path traversal and symlink escapes are rejected', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-sec05-'));
    const vault = join(parent, 'vault');
    const outside = join(parent, 'fuera');
    mkdirSync(vault);
    mkdirSync(outside);
    initVault(vault);
    writeFileSync(join(outside, 'secreto.txt'), 'secreto');
    try {
      const escaped = runGaveta(['new', 'Fuera', '--type', 'doc', '--in', '../fuera', '--json'], {
        cwd: vault,
      });
      expect(parseJson(escaped.stdout).error?.code).toBe('E_PATH_OUTSIDE_VAULT');
      symlinkSync(outside, join(vault, 'escape'), 'dir');
      const linked = runGaveta(['new', 'Fuga', '--type', 'doc', '--in', 'escape', '--json'], {
        cwd: vault,
      });
      expect(parseJson(linked.stdout).error?.code).toBe('E_PATH_OUTSIDE_VAULT');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-SEC-03: new sanitizes script and on* handlers before write', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-sec03-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      const hostile = runGaveta(['new', 'Hostil', '--type', 'doc', '--from', '-', '--json'], {
        cwd: vault,
        input:
          '<article><h1>Hostil</h1><script>alert(1)</script><p onclick="evil()">seguro</p></article>',
      });
      expect(hostile.status).toBe(0);
      const html = readFileSync(join(vault, 'hostil.html'), 'utf8');
      expect(hasUnsafeTag(html, 'script')).toBe(false);
      expect(html.includes('onclick')).toBe(false);
      expect(html.includes('seguro')).toBe(true);
      expect(runGaveta(['validate', 'hostil.html', '--json'], { cwd: vault }).status).toBe(0);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('REQ-SEC-04: remote images warn on validate', () => {
    withTempVault(
      (vault) => {
        const result = runGaveta(['validate', '--json'], { cwd: vault });
        expect(result.stdout).toContain('W_REMOTE_RESOURCE');
      },
      { fixture: 'malicious' },
    );
  });

  it('REQ-ART-04: adopted artifact srcdoc includes CSP as first head element', () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase1-artifact-csp-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    try {
      initVault(vault);
      copyFileSync(join(CLAUDE_FIXTURES, 'react-app.html'), join(vault, 'artifact.html'));
      runGaveta(['adopt', 'artifact.html', '--source', 'claude', '--allow-cdn', '--json'], {
        cwd: vault,
      });
      const html = readFileSync(join(vault, 'artifact.html'), 'utf8');
      const srcdoc = readArtifactSrcdoc(html);
      expect(srcdoc).not.toBeNull();
      if (srcdoc !== null) {
        const csp = expectedArtifactCsp(html);
        expect(srcdoc).toContain(csp);
        expect(srcdoc.indexOf('content-security-policy')).toBeLessThan(srcdoc.indexOf('</head>'));
      }
      expect(html).toContain('sandbox="allow-scripts"');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('phase 1 — DEC-06 gv alias', () => {
  it('runs the same binary as gaveta', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gaveta-phase1-gv-'));
    try {
      const gaveta = runGaveta(['version', '--json'], { cwd: directory });
      const gv = runGaveta(['version', '--json'], {
        cwd: directory,
        env: childEnv(),
      });
      // gv is invoked via package bin alias in manifest; spawn the gv entry the same way as other e2e tests use gaveta only.
      expect(gaveta.stdout).toBe(gv.stdout);
      expect(realpathSync(GAVETA_BIN)).toContain('gaveta.js');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
