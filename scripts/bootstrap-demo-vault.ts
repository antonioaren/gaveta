/**
 * (Re)builds examples/demo-vault with English sample notes via the real CLI pipeline.
 * Run: node --experimental-strip-types scripts/bootstrap-demo-vault.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { initVault, openVaultIndex } from '@gaveta/core';

export const DEMO_VAULT_RELATIVE = 'examples/demo-vault';

const REPO_ROOT = join(import.meta.dirname, '..');
export const DEMO_VAULT_ABS = join(REPO_ROOT, DEMO_VAULT_RELATIVE);
const GAVETA_BIN = join(REPO_ROOT, 'packages/cli/bin/gaveta.js');

interface NoteSpec {
  readonly title: string;
  readonly dest: string;
  readonly type: 'doc' | 'slides' | 'todo';
  readonly tags: string;
  readonly aliases?: string;
  readonly folder?: string;
  readonly article: string;
}

const NOTE_SPECS: readonly NoteSpec[] = [
  {
    title: 'Gaveta Demo Vault',
    dest: 'welcome.html',
    type: 'doc',
    tags: 'demo, start-here',
    aliases: 'Demo home',
    article: `<article>
      <h1>Gaveta Demo Vault</h1>
      <section id="overview">
        <p>
          A local knowledge base for developers: HTML notes, wikilinks, and a graph you can explore
          without leaving your machine.
        </p>
        <ul>
          <li>Read the [[Developer Handbook]] for rich formatting examples</li>
          <li>Skim [[Wikilinks and the Graph]] to see how connections work</li>
          <li>Open [[Project Map]] to tour the rest of this vault</li>
        </ul>
      </section>
    </article>`,
  },
  {
    title: 'Developer Handbook',
    dest: 'developer-handbook.html',
    type: 'doc',
    tags: 'demo, guide, reference',
    aliases: 'Handbook',
    article: `<article>
      <header class="note-header">
        <span class="note-type">Document</span>
        <h1>Developer Handbook</h1>
        <ul class="note-tags">
          <li><span class="badge">guide</span></li>
          <li><span class="badge">reference</span></li>
        </ul>
      </header>
      <nav class="toc">
        <a href="#callouts">Callouts</a>
        <a href="#table">Table</a>
        <a href="#code">Code</a>
      </nav>
      <section id="callouts">
        <h2>Callouts</h2>
        <aside class="callout" data-kind="info">
          <p>Gaveta stores notes as HTML files you can diff, grep, and edit with agents.</p>
        </aside>
        <aside class="callout" data-kind="tip">
          <p>Link ideas with <code>[[Wikilinks and the Graph]]</code> instead of brittle URLs.</p>
        </aside>
        <aside class="callout" data-kind="warning">
          <p>Keep secrets out of the vault; this demo is meant for public screenshots.</p>
        </aside>
      </section>
      <section id="table">
        <h2>Table</h2>
        <table>
          <caption>Where to look next</caption>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Architecture</td>
              <td>[[Architecture Notes]]</td>
            </tr>
            <tr>
              <td>CLI</td>
              <td>[[CLI Quick Reference]]</td>
            </tr>
            <tr>
              <td>Security</td>
              <td>[[Security Model]]</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section id="code">
        <h2>Code</h2>
        <pre><code class="language-ts">import { doctorVault } from '@gaveta/core';

const report = await doctorVault(process.cwd());
console.log(report.ok);</code></pre>
        <p>See also [[SQLite Index Internals]] and [[Local-First Knowledge]].</p>
      </section>
    </article>`,
  },
  {
    title: 'Local-First Knowledge',
    dest: 'local-first-knowledge.html',
    type: 'doc',
    tags: 'demo, concept',
    article: `<article>
      <h1>Local-First Knowledge</h1>
      <section id="idea">
        <p>Your notes live on disk. Search and the graph index are rebuildable from those files.</p>
        <p>Related: [[Architecture Notes]], [[Security Model]].</p>
      </section>
    </article>`,
  },
  {
    title: 'Wikilinks and the Graph',
    dest: 'wikilinks-and-graph.html',
    type: 'doc',
    tags: 'demo, concept, graph',
    article: `<article>
      <h1>Wikilinks and the Graph</h1>
      <section id="syntax">
        <p>Write <code>[[Note title]]</code> while drafting; Gaveta resolves them to canonical links.</p>
        <p>The global graph view connects [[Project Map]], [[API Conventions]], and [[Team Weekly Sync]].</p>
      </section>
    </article>`,
  },
  {
    title: 'Architecture Notes',
    dest: 'architecture-notes.html',
    type: 'doc',
    tags: 'demo, engineering',
    article: `<article>
      <h1>Architecture Notes</h1>
      <section id="layers">
        <h2>Layers</h2>
        <ul>
          <li><code>@gaveta/core</code> — contract, parser, index, operations</li>
          <li>CLI and local server share the same core</li>
          <li>React app reads through the API</li>
        </ul>
        <p>Deeper reading: [[SQLite Index Internals]], [[Deployment Runbook]].</p>
      </section>
    </article>`,
  },
  {
    title: 'SQLite Index Internals',
    dest: 'sqlite-index-internals.html',
    type: 'doc',
    tags: 'demo, concept, index',
    article: `<article>
      <h1>SQLite Index Internals</h1>
      <section id="fts">
        <p>FTS5 powers full-text search; the graph is derived from canonical link rows.</p>
        <p>Back to [[Architecture Notes]] or [[CLI Quick Reference]].</p>
      </section>
    </article>`,
  },
  {
    title: 'Security Model',
    dest: 'security-model.html',
    type: 'doc',
    tags: 'demo, security',
    article: `<article>
      <h1>Security Model</h1>
      <section id="local">
        <p>The server binds to loopback, sanitizes HTML, and rejects path escapes from the vault.</p>
        <p>Pair with [[Local-First Knowledge]] and [[Deployment Runbook]].</p>
      </section>
    </article>`,
  },
  {
    title: 'CLI Quick Reference',
    dest: 'cli-quick-reference.html',
    type: 'doc',
    tags: 'demo, cli',
    aliases: 'CLI cheatsheet',
    article: `<article>
      <h1>CLI Quick Reference</h1>
      <section id="commands">
        <pre><code class="language-bash">gaveta init
gaveta new "Title" --type doc --from -
gaveta doctor
gaveta serve</code></pre>
        <p>Workflow notes live in [[Developer Handbook]] and [[Onboarding Checklist]].</p>
      </section>
    </article>`,
  },
  {
    title: 'Team Weekly Sync',
    dest: 'meetings/team-weekly-sync.html',
    type: 'doc',
    tags: 'demo, meeting',
    folder: 'meetings',
    article: `<article>
      <h1>Team Weekly Sync</h1>
      <section id="meta">
        <p><strong>Date:</strong> <time datetime="2026-10-20">20 October 2026</time></p>
        <p><strong>Attendees:</strong> Alex, Priya, Marco</p>
      </section>
      <section id="agenda">
        <h2>Agenda</h2>
        <ul>
          <li>Shipped: graph view polish and editor round-trip tests</li>
          <li>Next: README screenshots from [[Gaveta Demo Vault]]</li>
          <li>Blocked: none</li>
        </ul>
        <p>Follow-ups captured in [[Sprint Tasks]].</p>
      </section>
    </article>`,
  },
  {
    title: 'Q4 Roadmap',
    dest: 'presentations/q4-roadmap.html',
    type: 'slides',
    tags: 'demo, roadmap',
    folder: 'presentations',
    article: `<section class="slide" id="title">
      <header class="note-header">
        <span class="note-type">Slides</span>
        <h1>Q4 Roadmap</h1>
        <p class="note-meta">Public demo vault and docs polish</p>
      </header>
    </section>
    <section class="slide" id="themes">
      <h2>Themes</h2>
      <ul>
        <li>Polished onboarding for new contributors</li>
        <li>Stable import/export for real Markdown folders</li>
        <li>Editor UX for daily note-taking</li>
      </ul>
      <p>Details in Architecture Notes and API Conventions.</p>
    </section>
    <section class="slide" id="milestones">
      <h2>Milestones</h2>
      <ol>
        <li>Demo vault with zero doctor warnings</li>
        <li>README screenshots at 16:9</li>
        <li>First social launch post</li>
      </ol>
    </section>`,
  },
  {
    title: 'Sprint Tasks',
    dest: 'sprint-tasks.html',
    type: 'todo',
    tags: 'demo, tasks',
    article: `<article>
      <header class="note-header">
        <span class="note-type">Tasks</span>
        <h1>Sprint Tasks</h1>
      </header>
      <ul class="tasks">
        <li data-g-task id="demo-vault" data-g-priority="high">
          <input type="checkbox" checked />
          Curate English demo vault
        </li>
        <li data-g-task id="screenshots" data-g-priority="high" data-g-due="2026-10-25">
          <input type="checkbox" />
          Capture Playwright screenshots
        </li>
        <li data-g-task id="readme" data-g-priority="medium">
          <input type="checkbox" />
          Wire images into README
        </li>
        <li data-g-task id="doctor" data-g-priority="low">
          <input type="checkbox" checked />
          Lock vault health with a unit test
        </li>
      </ul>
      <p>Context: [[Team Weekly Sync]] and [[Onboarding Checklist]].</p>
    </article>`,
  },
  {
    title: 'API Conventions',
    dest: 'api-conventions.html',
    type: 'doc',
    tags: 'demo, api',
    article: `<article>
      <h1>API Conventions</h1>
      <section id="rest">
        <p>Local HTTP handlers mirror CLI operations: read, search, graph, doctor.</p>
        <p>See [[Architecture Notes]] and [[Security Model]].</p>
      </section>
    </article>`,
  },
  {
    title: 'Onboarding Checklist',
    dest: 'onboarding-checklist.html',
    type: 'todo',
    tags: 'demo, onboarding',
    article: `<article>
      <h1>Onboarding Checklist</h1>
      <ul class="tasks">
        <li data-g-task id="clone">
          <input type="checkbox" checked />
          Clone the repository
        </li>
        <li data-g-task id="install">
          <input type="checkbox" checked />
          Run <code>pnpm install</code>
        </li>
        <li data-g-task id="demo">
          <input type="checkbox" />
          Try <code>pnpm demo</code>
        </li>
      </ul>
      <p>Read [[CLI Quick Reference]] and [[Developer Handbook]].</p>
    </article>`,
  },
  {
    title: 'Project Map',
    dest: 'project-map.html',
    type: 'doc',
    tags: 'demo, hub',
    article: `<article>
      <h1>Project Map</h1>
      <section id="hubs">
        <p>Start from [[Gaveta Demo Vault]], then branch out:</p>
        <ul>
          <li>Concepts: [[Local-First Knowledge]], [[Wikilinks and the Graph]], [[SQLite Index Internals]]</li>
          <li>Engineering: [[Architecture Notes]], [[API Conventions]], [[Security Model]]</li>
          <li>Planning: [[Q4 Roadmap]], [[Team Weekly Sync]], [[Sprint Tasks]]</li>
          <li>Ops: [[Deployment Runbook]]</li>
        </ul>
      </section>
    </article>`,
  },
  {
    title: 'Deployment Runbook',
    dest: 'projects/platform/deployment-runbook.html',
    type: 'doc',
    tags: 'demo, ops',
    folder: 'projects/platform',
    article: `<article>
      <h1>Deployment Runbook</h1>
      <section id="scope">
        <p>Gaveta is local-first; production deploy means shipping the desktop or self-hosted bundle.</p>
        <p>Cross-check [[Security Model]] and [[Architecture Notes]].</p>
      </section>
    </article>`,
  },
];

function stripWikilinks(article: string): string {
  let out = '';
  let index = 0;
  while (index < article.length) {
    const start = article.indexOf('[[', index);
    if (start === -1) {
      out += article.slice(index);
      break;
    }
    if (start > 0 && article[start - 1] === '!') {
      out += article.slice(index, start + 2);
      index = start + 2;
      continue;
    }
    out += article.slice(index, start);
    const end = article.indexOf(']]', start + 2);
    if (end === -1) {
      out += article.slice(start);
      break;
    }
    out += article.slice(start + 2, end);
    index = end + 2;
  }
  return out;
}

function readNoteHash(vaultRoot: string, title: string): string {
  const stdout = runGaveta(['read', title, '--json'], vaultRoot);
  const envelope = JSON.parse(stdout) as { data?: { hash?: string } };
  const hash = envelope.data?.hash;
  if (hash === undefined) {
    throw new Error(`gaveta read "${title}" missing hash`);
  }
  return hash;
}

function replaceNoteBody(vaultRoot: string, spec: NoteSpec): void {
  const hash = readNoteHash(vaultRoot, spec.title);
  const result = spawnSync(
    process.execPath,
    [
      GAVETA_BIN,
      'edit',
      spec.title,
      '--replace',
      '--if-match',
      hash,
      '--from',
      '-',
      '--json',
      '--vault',
      vaultRoot,
    ],
    {
      cwd: vaultRoot,
      input: spec.article,
      encoding: 'utf8',
      env: { ...process.env, GAVETA_VAULT: vaultRoot },
    },
  );
  if (result.status !== 0) {
    throw new Error(`gaveta edit "${spec.title}" failed: ${result.stderr || result.stdout}`);
  }
  fixThemeStylesheetHref(vaultRoot, spec.dest);
}

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

function createNote(vaultRoot: string, spec: NoteSpec): void {
  const args = [
    'new',
    spec.title,
    '--type',
    spec.type,
    '--tags',
    spec.tags,
    '--from',
    '-',
    '--json',
  ];
  if (spec.aliases !== undefined) {
    args.push('--aliases', spec.aliases);
  }
  if (spec.folder !== undefined) {
    args.push('--in', spec.folder);
  }
  const result = spawnSync(process.execPath, [GAVETA_BIN, ...args, '--vault', vaultRoot], {
    cwd: vaultRoot,
    input: stripWikilinks(spec.article),
    encoding: 'utf8',
    env: { ...process.env, GAVETA_VAULT: vaultRoot },
  });
  if (result.status !== 0) {
    throw new Error(`gaveta new "${spec.title}" failed: ${result.stderr || result.stdout}`);
  }
  const envelope = JSON.parse(result.stdout) as { data?: { path?: string } };
  const produced = envelope.data?.path;
  if (produced === undefined) {
    throw new Error(`gaveta new "${spec.title}" missing path`);
  }
  const destAbs = join(vaultRoot, spec.dest);
  mkdirSync(dirname(destAbs), { recursive: true });
  const producedAbs = join(vaultRoot, produced);
  if (producedAbs !== destAbs) {
    rmSync(destAbs, { force: true });
    renameSync(producedAbs, destAbs);
  }
  fixThemeStylesheetHref(vaultRoot, spec.dest);
}

function fixThemeStylesheetHref(vaultRoot: string, relativePath: string): void {
  const absolute = join(vaultRoot, relativePath);
  const html = readFileSync(absolute, 'utf8');
  const depth = relativePath.split('/').length - 1;
  const expected =
    depth === 0 ? 'href=".gaveta/theme.css"' : `href="${'../'.repeat(depth)}.gaveta/theme.css"`;
  const fixed = html.replace(/href="(?:\.\.\/)*\.gaveta\/theme\.css"/, expected);
  if (fixed !== html) {
    writeFileSync(absolute, fixed, 'utf8');
  }
}

export async function bootstrapDemoVault(vaultRoot: string = DEMO_VAULT_ABS): Promise<void> {
  mkdirSync(vaultRoot, { recursive: true });
  if (!existsSync(join(vaultRoot, '.gaveta', 'config.json'))) {
    await initVault({ cwd: vaultRoot });
  }

  for (const spec of NOTE_SPECS) {
    rmSync(join(vaultRoot, spec.dest), { force: true });
  }

  for (const spec of NOTE_SPECS) {
    createNote(vaultRoot, spec);
  }

  runGaveta(['reindex', '--json'], vaultRoot);

  for (const spec of NOTE_SPECS) {
    if (spec.type === 'slides') {
      continue;
    }
    replaceNoteBody(vaultRoot, spec);
  }

  runGaveta(['reindex', '--json'], vaultRoot);

  const doctorStdout = runGaveta(['doctor', '--json'], vaultRoot);
  const doctor = JSON.parse(doctorStdout) as { ok: boolean; data?: { ok: boolean } };
  if (!doctor.ok && doctor.data?.ok !== true) {
    throw new Error(`demo vault doctor failed: ${doctorStdout}`);
  }

  const index = await openVaultIndex(vaultRoot);
  try {
    const recovery = index.recovery();
    if (recovery !== null) {
      throw new Error(`index recovery required: ${recovery.code}`);
    }
  } finally {
    index.close();
  }

  for (const artifact of [
    'index.sqlite',
    'index.sqlite-shm',
    'index.sqlite-wal',
    'mermaid.min.js',
    'mermaid-boot.js',
    'MERMAID-LICENSE.txt',
  ]) {
    rmSync(join(vaultRoot, '.gaveta', artifact), { force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await bootstrapDemoVault();
  console.info(`Demo vault ready at ${DEMO_VAULT_RELATIVE}`);
}
