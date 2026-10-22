import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKLINKS,
  BACKLINK_COUNT,
  DUPLICATE_ID,
  GHOST_TITLE,
  MALICIOUS,
  MISSING_ID,
  NOTE_X,
  PROBLEMS,
  linkerRel,
  linkerSpec,
  type FixtureNoteSpec,
} from './catalog.ts';
import { CREATED, REL_VOCABULARY, VALIDATOR_CODES } from './constants.ts';
import { inspectNote, metaContents, type InspectedNote } from './inspect.ts';
import {
  FIXTURES_ROOT,
  resolveInsideVault,
  themeHrefFor,
  vaultPath,
  type VaultName,
} from './paths.ts';
import { slugify } from './slug.ts';
import { ULID_PATTERN } from './ulid.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITY = /^(low|medium|high)$/;
const UNSAFE = [
  /<script/i,
  /javascript:/i,
  /\son[a-z]+=/i,
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
  /<form\b/i,
  /<base\b/i,
  /https?:\/\//i,
  /\ssrcset=/i,
  /\sstyle=/i,
  /expression\s*\(/i,
];

interface LoadedNote {
  path: string;
  html: string;
  note: InspectedNote;
}

function walk(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (entry.isSymbolicLink()) {
      throw new Error(`unexpected symlink ${path}`);
    }
    if (entry.isDirectory()) {
      found.push(...walk(absolute, root));
    } else if (entry.isFile()) {
      found.push(path);
    } else {
      throw new Error(`unexpected entry ${path}`);
    }
  }
  return found.sort();
}

function loadNotes(name: VaultName): LoadedNote[] {
  return walk(vaultPath(name))
    .filter((path) => path.endsWith('.html'))
    .map((path) => {
      const html = readFileSync(join(vaultPath(name), path), 'utf8');
      return { path, html, note: inspectNote(html) };
    });
}

function quoted(html: string, attribute: string): string[] {
  return [...html.matchAll(new RegExp(`${attribute}="([^"]*)"`, 'g'))].map(
    (match) => match[1] ?? '',
  );
}

function single(values: string[], label: string): string {
  if (values.length !== 1) {
    throw new Error(`${label} count is ${String(values.length)}`);
  }
  const value = values[0];
  if (value === undefined) {
    throw new Error(`${label} is missing`);
  }
  return value;
}

function assertShape(file: LoadedNote, spec: FixtureNoteSpec): void {
  expect(file.html.startsWith('<!doctype html>\n'), file.path).toBe(true);
  expect(file.html.endsWith('\n'), file.path).toBe(true);
  expect(file.html.includes('\r'), file.path).toBe(false);
  expect(file.note.lang, file.path).toBe('es');
  expect(file.note.charset, file.path).toBe('utf-8');
  expect(file.note.title, file.path).toBe(spec.title);
  expect(file.note.h1, file.path).toBe(spec.title);
  expect(file.html.match(/<h1>/g)).toHaveLength(1);
  expect(single(metaContents(file.note, 'gaveta:id'), 'id')).toBe(spec.id);
  expect(spec.id).toMatch(ULID_PATTERN);
  expect(single(metaContents(file.note, 'gaveta:type'), 'type')).toBe(spec.type);
  expect(single(metaContents(file.note, 'gaveta:created'), 'created')).toBe(CREATED);
  expect(metaContents(file.note, 'gaveta:tags')).toEqual(
    spec.tags === undefined ? [] : [spec.tags],
  );
  expect(metaContents(file.note, 'gaveta:aliases')).toEqual(
    spec.aliases === undefined ? [] : [spec.aliases],
  );
  expect(
    file.path.endsWith(`/${slugify(spec.title)}.html`) ||
      file.path === `${slugify(spec.title)}.html`,
  ).toBe(true);
  expect(file.note.hasArticle, file.path).toBe(true);
  expect(quoted(file.html, 'data-g-to')).toEqual(
    file.note.anchors.flatMap((anchor) => (anchor.to === null ? [] : [anchor.to])),
  );
  expect(quoted(file.html, 'data-g-pending')).toEqual(
    file.note.anchors.flatMap((anchor) => (anchor.pending === null ? [] : [anchor.pending])),
  );

  if (spec.type === 'doc') {
    expect(file.note.hasSlide, file.path).toBe(false);
    expect(file.note.hasTaskList, file.path).toBe(false);
    expect(file.html, file.path).toMatch(/<section\b/);
  }
  if (spec.type === 'slides') {
    expect(file.note.hasSlide, file.path).toBe(true);
    expect(file.note.hasSpeakerNotes, file.path).toBe(true);
  }
  if (spec.type === 'todo') {
    expect(file.note.hasTaskList, file.path).toBe(true);
    expect(file.note.hasTaskMarker, file.path).toBe(true);
    expect(file.note.checkboxes.length, file.path).toBeGreaterThan(0);
  }

  for (const match of file.html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const heading = /<h2>([^<]*)<\/h2>/.exec(inner)?.[1];
    if (heading !== undefined) {
      expect(/(?:^|\s)id="([^"]*)"/.exec(attrs)?.[1], `${file.path}#${heading}`).toBe(
        slugify(heading),
      );
    }
  }
}

function idsOf(files: readonly LoadedNote[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of files) {
    const id = single(metaContents(file.note, 'gaveta:id'), file.path);
    const paths = map.get(id) ?? [];
    paths.push(file.path);
    map.set(id, paths);
  }
  return map;
}

function referencedIds(files: readonly LoadedNote[]): Set<string> {
  const known = new Set(idsOf(files).keys());
  const referenced = new Set<string>();
  for (const file of files) {
    for (const anchor of file.note.anchors) {
      if (anchor.to !== null && known.has(anchor.to)) {
        referenced.add(anchor.to);
      }
    }
  }
  return referenced;
}

function orphanPaths(files: readonly LoadedNote[]): string[] {
  const referenced = referencedIds(files);
  return files
    .filter((file) => {
      const id = single(metaContents(file.note, 'gaveta:id'), file.path);
      const outgoing = file.note.anchors.length > 0 || file.note.wikilinks.length > 0;
      return !outgoing && !referenced.has(id);
    })
    .map((file) => file.path);
}

function localTheme(note: InspectedNote): string {
  const local = note.stylesheetHrefs.filter((href) => href.includes('.gaveta/theme.css'));
  return single(local, 'theme');
}

describe('note inspector', () => {
  it('reads multiline anchors, ghost links, and wikilinks', () => {
    const note = inspectNote(`<!doctype html>
<html lang="es">
  <body>
    <p>
      <a
        href="../nota-x.html"
        data-g-to="${NOTE_X.id}"
        rel="related"
        >Nota X</a
      >
    </p>
    <p><a data-g-pending="${GHOST_TITLE}">Nota fantasma</a></p>
    <p>[[Destino enlace]]</p>
    <ul class="tasks">
      <li
        data-g-task
        id="revisar"
        data-g-due="2026-10-22"
        data-g-priority="medium"
      >
        <input type="checkbox" checked />
      </li>
    </ul>
  </body>
</html>
`);
    expect(note.anchors[0]).toMatchObject({
      href: '../nota-x.html',
      to: NOTE_X.id,
      rel: 'related',
      pending: null,
      text: 'Nota X',
    });
    expect(note.anchors[1]).toMatchObject({
      href: null,
      to: null,
      pending: GHOST_TITLE,
      text: GHOST_TITLE,
    });
    expect(note.wikilinks).toEqual(['[[Destino enlace]]']);
    expect(note.hasTaskList).toBe(true);
    expect(note.hasTaskMarker).toBe(true);
    expect(note.checkboxes).toEqual([{ checked: true }]);
    expect(note.dues).toEqual(['2026-10-22']);
    expect(note.priorities).toEqual(['medium']);
  });

  it('drops tags from anchor text and keeps only closed wikilinks', () => {
    const note = inspectNote(`<!doctype html>
<html lang="es">
  <body>
    <p><a href="nota.html" data-g-to="${NOTE_X.id}">Nota <em>X</em> <script</a></p>
    <p>[[Destino enlace]] [[Destino enlace|texto]] [[[Sección]]</p>
    <p>[[sin cierre</p>
    <p>[[con
salto]]</p>
  </body>
</html>
`);
    expect(note.anchors[0]?.text).toBe('Nota X');
    expect(note.wikilinks).toEqual([
      '[[Destino enlace]]',
      '[[Destino enlace|texto]]',
      '[[[Sección]]',
    ]);
  });
});

describe('vault skeleton', () => {
  it('shares one config and one default theme, and stores no index', () => {
    const emptyFiles = walk(vaultPath('empty'));
    expect(emptyFiles).toEqual(['.gaveta/config.json', '.gaveta/theme.css']);
    const configBytes = readFileSync(join(vaultPath('empty'), '.gaveta/config.json'));
    const themeBytes = readFileSync(join(vaultPath('empty'), '.gaveta/theme.css'));
    expect(themeBytes.toString('utf8')).toContain('--color-accent');
    expect(themeBytes.toString('utf8')).toContain('#faf8f5');

    for (const name of ['empty', 'backlinks', 'problems', 'malicious'] as const) {
      expect(readFileSync(join(vaultPath(name), '.gaveta/config.json'))).toEqual(configBytes);
      expect(readFileSync(join(vaultPath(name), '.gaveta/theme.css'))).toEqual(themeBytes);
      const config: unknown = JSON.parse(configBytes.toString('utf8'));
      if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        throw new Error('config is not an object');
      }
      expect(Object.keys(config).sort()).toEqual(['rel', 'remoteAllowlist']);
      const record = config as Record<string, unknown>;
      expect(record.remoteAllowlist).toEqual([]);
      const rel = record.rel;
      if (typeof rel !== 'object' || rel === null || Array.isArray(rel)) {
        throw new Error('rel is not an object');
      }
      expect(rel).toEqual({ vocabulary: [...REL_VOCABULARY], strict: false });
    }

    const all = walk(join(FIXTURES_ROOT, 'vaults'));
    expect(all.some((path) => path.endsWith('index.sqlite'))).toBe(false);
    expect(all.some((path) => path.endsWith('.html') && path.startsWith('empty/'))).toBe(false);
  });
});

describe('backlinks vault (REQ-LINK-09)', () => {
  const files = loadNotes('backlinks');

  it('contains exactly the catalog notes, the skeleton, and one local image', () => {
    expect(walk(vaultPath('backlinks'))).toEqual(
      [
        '.gaveta/config.json',
        '.gaveta/theme.css',
        'attachments/pixel.png',
        ...BACKLINKS.map((spec) => spec.path),
      ].sort(),
    );
    const png = readFileSync(join(vaultPath('backlinks'), 'attachments/pixel.png'));
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('is well-formed, safe, and has twenty canonical links to Nota X', () => {
    expect(files.map((file) => file.path).sort()).toEqual(
      BACKLINKS.map((spec) => spec.path).sort(),
    );
    const specs = new Map(BACKLINKS.map((spec) => [spec.path, spec]));
    for (const file of files) {
      const spec = specs.get(file.path);
      if (spec === undefined) {
        throw new Error(`unexpected note ${file.path}`);
      }
      assertShape(file, spec);
      expect(localTheme(file.note), file.path).toBe(themeHrefFor(file.path));
      for (const pattern of UNSAFE) {
        expect(file.html, `${file.path} ${pattern.source}`).not.toMatch(pattern);
      }
      for (const due of file.note.dues) {
        expect(due, file.path).toMatch(ISO_DATE);
      }
      for (const priority of file.note.priorities) {
        expect(priority, file.path).toMatch(PRIORITY);
      }
      expect(file.html.includes('sqlite'), file.path).toBe(false);
    }

    expect(orphanPaths(files)).toEqual([]);
    const idPaths = [...idsOf(files).values()];
    expect(idPaths.every((paths) => paths.length === 1)).toBe(true);

    const toX = files.flatMap((file) =>
      file.note.anchors
        .filter((anchor) => anchor.to === NOTE_X.id)
        .map((anchor) => ({ path: file.path, anchor })),
    );
    expect(toX).toHaveLength(BACKLINK_COUNT);
    const shallow: string[] = [];
    const deep: string[] = [];
    for (let index = 1; index <= BACKLINK_COUNT; index += 1) {
      const spec = linkerSpec(index);
      const hit = toX.find((item) => item.path === spec.path);
      if (hit === undefined) {
        throw new Error(`missing backlink ${spec.path}`);
      }
      expect(hit.anchor.text).toBe(NOTE_X.title);
      expect(hit.anchor.rel).toBe(linkerRel(index));
      expect(hit.anchor.pending).toBeNull();
      const href = index <= 10 ? '../nota-x.html' : '../../nota-x.html';
      expect(hit.anchor.href).toBe(href);
      expect(resolveInsideVault(spec.path, href)).toBe(NOTE_X.path);
      if (index <= 10) {
        shallow.push(spec.path);
      } else {
        deep.push(spec.path);
      }
      const file = files.find((item) => item.path === spec.path);
      expect(file?.note.anchors).toHaveLength(1);
    }
    expect(shallow).toHaveLength(10);
    expect(deep).toHaveLength(10);
    expect(
      files
        .filter((file) => file.html.includes(NOTE_X.id))
        .map((file) => file.path)
        .sort(),
    ).toEqual(
      [
        NOTE_X.path,
        ...Array.from({ length: BACKLINK_COUNT }, (_, index) => linkerSpec(index + 1).path),
      ].sort(),
    );

    const noteX = files.find((file) => file.path === NOTE_X.path);
    if (noteX === undefined) {
      throw new Error('Nota X is missing');
    }
    expect(noteX.note.anchors).toEqual([]);
    expect(noteX.note.images.map((image) => image.src)).toEqual(['attachments/pixel.png']);
    expect(resolveInsideVault(NOTE_X.path, 'attachments/pixel.png')).toBe('attachments/pixel.png');
    for (const snippet of [
      'class="callout"',
      'data-kind="info"',
      'data-kind="warn"',
      '<table',
      '<caption>',
      'Enlaces entrantes',
      '<figure>',
      'class="language-html"',
      'Pixel de prueba',
    ]) {
      expect(noteX.html, snippet).toContain(snippet);
    }

    const slides = files.find((file) => file.path === linkerSpec(19).path);
    const todo = files.find((file) => file.path === linkerSpec(20).path);
    expect(slides?.note.hasSpeakerNotes).toBe(true);
    expect(todo?.note.checkboxes).toEqual([{ checked: false }, { checked: true }]);
    expect(todo?.note.dues).toEqual(['2026-10-22', '2026-10-23']);
    expect(todo?.note.priorities).toEqual(['medium', 'low']);

    const forms = files.find((file) => file.path === 'formas-de-enlace.html');
    const target = BACKLINKS.find((spec) => spec.path === 'destino-enlace.html');
    if (forms === undefined || target === undefined) {
      throw new Error('link forms are missing');
    }
    expect(forms.note.wikilinks).toEqual([
      '[[Destino enlace]]',
      '[[Destino enlace|texto visible]]',
      '[[Destino enlace#resumen]]',
    ]);
    expect(forms.note.wikilinks.every((link) => !link.includes('\n'))).toBe(true);
    expect(forms.note.anchors).toEqual([
      {
        href: 'destino-enlace.html',
        to: target.id,
        pending: null,
        rel: 'related',
        text: 'Destino enlace',
      },
      {
        href: null,
        to: null,
        pending: GHOST_TITLE,
        rel: null,
        text: GHOST_TITLE,
      },
    ]);
    expect(files.flatMap((file) => file.note.wikilinks)).toHaveLength(3);
    expect(
      files
        .filter((file) => file.path !== 'formas-de-enlace.html')
        .every((file) => file.note.wikilinks.length === 0),
    ).toBe(true);
  });
});

describe('problems vault (REQ-LINK-11)', () => {
  const files = loadNotes('problems');

  it('has one broken link, one ghost, one orphan, one duplicate id, and one invalid note', () => {
    expect(walk(vaultPath('problems'))).toEqual(
      ['.gaveta/config.json', '.gaveta/theme.css', ...PROBLEMS.map((spec) => spec.path)].sort(),
    );
    const specs = new Map(PROBLEMS.map((spec) => [spec.path, spec]));
    for (const file of files) {
      const spec = specs.get(file.path);
      if (spec === undefined) {
        throw new Error(`unexpected note ${file.path}`);
      }
      assertShape(file, spec);
      for (const pattern of UNSAFE) {
        expect(file.html, `${file.path} ${pattern.source}`).not.toMatch(pattern);
      }
      expect(file.note.wikilinks, file.path).toEqual([]);
      expect(file.html.includes('[['), file.path).toBe(false);
      for (const anchor of file.note.anchors) {
        if (anchor.href !== null) {
          expect(resolveInsideVault(file.path, anchor.href), file.path).not.toBeNull();
        }
      }
    }

    const destino = PROBLEMS.find((spec) => spec.path === 'nota-destino.html');
    if (destino === undefined) {
      throw new Error('missing destino');
    }
    const known = idsOf(files);
    expect([...known.entries()].filter(([, paths]) => paths.length > 1)).toEqual([
      [DUPLICATE_ID, ['dup/duplicado-alfa.html', 'dup/duplicado-beta.html']],
    ]);

    const broken = files.flatMap((file) =>
      file.note.anchors
        .filter((anchor) => anchor.to !== null && !known.has(anchor.to))
        .map((anchor) => ({ path: file.path, href: anchor.href, to: anchor.to })),
    );
    expect(broken).toEqual([{ path: 'nota-rota.html', href: 'no-existe.html', to: MISSING_ID }]);

    const pending = files.flatMap((file) =>
      file.note.anchors
        .filter((anchor) => anchor.pending !== null)
        .map((anchor) => ({ path: file.path, href: anchor.href, title: anchor.pending })),
    );
    expect(pending).toEqual([{ path: 'nota-pendiente.html', href: null, title: GHOST_TITLE }]);
    expect(orphanPaths(files)).toEqual(['nota-huerfana.html']);

    const uniqueTarget = new Map<string, string>();
    for (const [id, paths] of known) {
      if (paths.length === 1 && paths[0] !== undefined) {
        uniqueTarget.set(id, paths[0]);
      }
    }
    const stale = files.flatMap((file) =>
      file.note.anchors.flatMap((anchor) => {
        if (anchor.to === null || anchor.href === null) {
          return [];
        }
        const target = uniqueTarget.get(anchor.to);
        if (target === undefined) {
          return [];
        }
        const resolved = resolveInsideVault(file.path, anchor.href);
        return resolved === target ? [] : [{ path: file.path, href: anchor.href, target }];
      }),
    );
    expect(stale).toEqual([
      { path: 'href-desfasado.html', href: 'ruta-incorrecta.html', target: 'nota-destino.html' },
    ]);

    const theme = files.flatMap((file) => {
      const href = localTheme(file.note);
      return href === themeHrefFor(file.path) ? [] : [{ path: file.path, href }];
    });
    expect(theme).toEqual([{ path: 'anidada/ruta-del-tema.html', href: '.gaveta/theme.css' }]);

    const badDue = files.flatMap((file) =>
      file.note.dues.filter((due) => !ISO_DATE.test(due)).map((due) => ({ path: file.path, due })),
    );
    expect(badDue).toEqual([{ path: 'nota-invalida.html', due: 'not-a-date' }]);
    const invalid = files.find((file) => file.path === 'nota-invalida.html');
    expect(invalid?.note.priorities).toEqual(['high']);
    expect(invalid?.note.checkboxes).toEqual([{ checked: false }]);
    expect(invalid?.note.anchors).toMatchObject([
      { href: 'nota-destino.html', to: destino.id, rel: 'related' },
    ]);

    for (const path of ['dup/duplicado-alfa.html', 'dup/duplicado-beta.html']) {
      const file = files.find((item) => item.path === path);
      expect(file?.note.anchors).toMatchObject([
        { href: '../nota-destino.html', to: destino.id, rel: 'related' },
      ]);
    }
    expect(files.find((file) => file.path === 'nota-sana.html')?.note.anchors).toMatchObject([
      { href: 'nota-destino.html', to: destino.id },
    ]);
    expect(
      files.find((file) => file.path === 'anidada/ruta-del-tema.html')?.note.anchors,
    ).toMatchObject([{ href: '../nota-destino.html', to: destino.id }]);
    expect(files.find((file) => file.path === 'nota-destino.html')?.note.anchors).toEqual([]);
    expect(files.find((file) => file.path === 'nota-huerfana.html')?.note.anchors).toEqual([]);
    for (const priority of files.flatMap((file) => file.note.priorities)) {
      expect(priority).toMatch(PRIORITY);
    }
  });
});

describe('malicious vault (REQ-SEC-01, REQ-SEC-02)', () => {
  const files = loadNotes('malicious');

  it('covers each unsafe payload and keeps path escapes inside the fixture text', () => {
    expect(walk(vaultPath('malicious'))).toEqual(
      ['.gaveta/config.json', '.gaveta/theme.css', ...MALICIOUS.map((spec) => spec.path)].sort(),
    );
    const specs = new Map(MALICIOUS.map((spec) => [spec.path, spec]));
    const codes = new Set<string>();
    for (const file of files) {
      const spec = specs.get(file.path);
      if (spec === undefined) {
        throw new Error(`unexpected note ${file.path}`);
      }
      assertShape(file, spec);
      expect(localTheme(file.note).includes('.gaveta/theme.css'), file.path).toBe(true);
      expect(resolveInsideVault(file.path, localTheme(file.note)), file.path).toBe(
        '.gaveta/theme.css',
      );
      for (const payload of spec.payloads) {
        expect(file.html, `${file.path} ${payload}`).toContain(payload);
      }
      for (const code of spec.codes) {
        codes.add(code);
      }
      expect(file.note.wikilinks, file.path).toEqual([]);
    }

    expect([...codes].sort()).toEqual([...VALIDATOR_CODES].sort());
    expect(MALICIOUS.map((spec) => spec.caseId).sort()).toEqual(
      [
        'base',
        'combined',
        'embed',
        'form',
        'handler',
        'iframe',
        'inline-style',
        'javascript-url',
        'meta-refresh',
        'object',
        'path-traversal',
        'remote-image',
        'remote-stylesheet',
        'script',
      ].sort(),
    );
    expect([...idsOf(files).values()].every((paths) => paths.length === 1)).toBe(true);

    const traversal = files.find((file) => file.path === 'path-traversal.html');
    if (traversal === undefined) {
      throw new Error('missing path traversal note');
    }
    const references = [
      ...traversal.note.anchors.map((anchor) => anchor.href),
      ...traversal.note.images.map((image) => image.src),
    ];
    expect(references.every((reference) => reference !== null)).toBe(true);
    for (const reference of references) {
      if (reference !== null) {
        expect(resolveInsideVault(traversal.path, reference), reference).toBeNull();
      }
    }

    const combined = files.find((file) => file.path === 'combinada.html');
    expect(combined?.html).toContain('<script>');
    expect(combined?.html).toContain('onerror="alert(1)"');
    expect(combined?.html).toContain('src="https://evil.example/pixel.png"');
  });
});

describe('fixtures README', () => {
  it('names every vault and says to re-validate after T1.3', () => {
    const readme = readFileSync(join(FIXTURES_ROOT, 'README.md'), 'utf8');
    for (const phrase of [
      'T1.3',
      'Re-validate',
      'REQ-LINK-09',
      'REQ-LINK-11',
      'REQ-SEC-01',
      'REQ-SEC-02',
      'REQ-NFR',
      '1000',
      '5000',
      'data-g-pending',
      '[[',
      'vaults/empty',
      'Nota X',
    ]) {
      expect(readme, phrase).toContain(phrase);
    }
  });
});
