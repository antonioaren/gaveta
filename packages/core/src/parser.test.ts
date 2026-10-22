import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTICS,
  MAX_NOTE_DEPTH,
  MAX_NOTE_HTML_CHARS,
  parseNote,
  type NoteModel,
  type ParseResult,
} from './index.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const TARGET_ID = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const OTHER_ID = '01JB9C3N5S8D0E2F4G6H8J1K2M';

interface Shell {
  readonly title?: string | null;
  readonly id?: string | null;
  readonly type?: string | null;
  readonly created?: string | null;
  readonly updated?: string | null;
  readonly tags?: string | null;
  readonly aliases?: string | null;
  readonly extraHead?: string;
}

function metaTag(name: string, content: string): string {
  return `<meta name="${name}" content="${content}">`;
}

function document(body: string, options: Shell = {}): string {
  const head: string[] = ['<meta charset="utf-8">'];
  if (options.title !== null) {
    head.push(`<title>${options.title ?? 'Gaveta — PRD'}</title>`);
  }
  if (options.id !== null) {
    head.push(metaTag('gaveta:id', options.id ?? NOTE_ID));
  }
  if (options.type !== null) {
    head.push(metaTag('gaveta:type', options.type ?? 'doc'));
  }
  if (options.created !== null) {
    head.push(metaTag('gaveta:created', options.created ?? '2026-10-22T10:00:00Z'));
  }
  if (typeof options.updated === 'string') {
    head.push(metaTag('gaveta:updated', options.updated));
  }
  if (typeof options.tags === 'string') {
    head.push(metaTag('gaveta:tags', options.tags));
  }
  if (typeof options.aliases === 'string') {
    head.push(metaTag('gaveta:aliases', options.aliases));
  }
  if (typeof options.extraHead === 'string') {
    head.push(options.extraHead);
  }
  return [
    '<!doctype html>',
    '<html lang="es">',
    '<head>',
    head.join('\n'),
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

function requireNote(result: ParseResult): NoteModel {
  expect(result.note).not.toBeNull();
  if (result.note === null) {
    throw new Error('expected a note model');
  }
  return result.note;
}

function codes(result: ParseResult): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

const FULL_BODY = [
  '<article>',
  '<h1>Título</h1>',
  '<section id="resumen">',
  '<h2>Resumen</h2>',
  '<p>Texto con <strong>énfasis</strong>.</p>',
  '<pre><code class="language-ts">const x = true;</code></pre>',
  '<table><tr><td>Valor</td></tr></table>',
  '</section>',
  '<section id="tareas">',
  '<h2>Tareas</h2>',
  '<ul class="tasks">',
  '<li data-g-task id="revisar" data-g-due="2026-10-22" data-g-priority="high">',
  '<input type="checkbox" checked>',
  'Revisar el contrato',
  '</li>',
  '</ul>',
  `<p>Ver [[Roadmap#plan|el plan]] y <a href="../decisiones/usar-sqlite.html" data-g-to="${TARGET_ID}" rel="depends-on">Usar SQLite</a>.</p>`,
  '<p><a data-g-pending="Nota fantasma">un fantasma</a></p>',
  '</section>',
  '</article>',
].join('\n');

describe('parseNote full document', () => {
  it('extracts metadata, sections, links, tasks, and plain text', () => {
    const html = document(FULL_BODY, {
      tags: ' producto, prd , , ',
      aliases: ' PRD Gaveta , Otro ',
      updated: '2026-10-22T12:00:00Z',
    });
    const result = parseNote(html);
    const note = requireNote(result);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(note.diagnostics).toBe(result.diagnostics);
    expect(note.title).toBe('Gaveta — PRD');
    expect(note.id).toBe(NOTE_ID);
    expect(note.type).toBe('doc');
    expect(note.metadata).toEqual({
      title: 'Gaveta — PRD',
      id: NOTE_ID,
      type: 'doc',
      rawType: 'doc',
      created: '2026-10-22T10:00:00Z',
      updated: '2026-10-22T12:00:00Z',
      tags: ['producto', 'prd'],
      aliases: ['PRD Gaveta', 'Otro'],
    });

    expect(
      note.headings.map((heading) => [
        heading.level,
        heading.text,
        heading.warning,
        heading.sectionId,
      ]),
    ).toEqual([
      [1, 'Título', false, null],
      [2, 'Resumen', false, 'resumen'],
      [2, 'Tareas', false, 'tareas'],
    ]);

    expect(note.sections).toHaveLength(2);
    const resumen = note.sections[0];
    const tareas = note.sections[1];
    if (resumen === undefined || tareas === undefined) {
      throw new Error('expected two sections');
    }
    expect(resumen.id).toBe('resumen');
    expect(resumen.heading?.text).toBe('Resumen');
    expect(resumen.plainText).toBe(
      ['Resumen', 'Texto con énfasis.', 'const x = true;', 'Valor'].join('\n'),
    );
    expect(tareas.id).toBe('tareas');
    expect(tareas.children).toEqual([]);

    expect(note.plainText).toBe(
      [
        'Título',
        'Resumen',
        'Texto con énfasis.',
        'const x = true;',
        'Valor',
        'Tareas',
        'Revisar el contrato',
        'Ver [[Roadmap#plan|el plan]] y Usar SQLite.',
        'un fantasma',
      ].join('\n'),
    );

    expect(note.links.map((link) => link.kind)).toEqual(['wikilink', 'canonical', 'pending']);
    const wikilink = note.links[0];
    const canonical = note.links[1];
    const pending = note.links[2];
    if (wikilink === undefined || canonical === undefined || pending === undefined) {
      throw new Error('expected three links');
    }
    expect(wikilink).toMatchObject({
      kind: 'wikilink',
      text: 'el plan',
      href: null,
      targetId: null,
      pendingTitle: 'Roadmap',
      ghost: false,
      sectionId: 'tareas',
      wikilink: {
        raw: '[[Roadmap#plan|el plan]]',
        title: 'Roadmap',
        section: 'plan',
        label: 'el plan',
      },
    });
    expect(canonical).toMatchObject({
      kind: 'canonical',
      text: 'Usar SQLite',
      href: '../decisiones/usar-sqlite.html',
      targetId: TARGET_ID,
      pendingTitle: null,
      rel: 'depends-on',
      ghost: false,
      sectionId: 'tareas',
      wikilink: null,
    });
    expect(pending).toMatchObject({
      kind: 'pending',
      text: 'un fantasma',
      pendingTitle: 'Nota fantasma',
      ghost: true,
      targetId: null,
      href: null,
      sectionId: 'tareas',
    });

    expect(note.tasks).toEqual([
      expect.objectContaining({
        id: 'revisar',
        text: 'Revisar el contrato',
        checked: true,
        due: '2026-10-22',
        priority: 'high',
        sectionId: 'tareas',
      }),
    ]);
  });

  it('decodes entities and keeps a lowercase ULID as written', () => {
    const lower = NOTE_ID.toLowerCase();
    const result = parseNote(
      document('<p>A &amp; B</p>', { title: 'A &amp; B', id: lower, created: '2026-10-22' }),
    );
    const note = requireNote(result);
    expect(result.ok).toBe(true);
    expect(note.title).toBe('A & B');
    expect(note.id).toBe(lower);
    expect(note.metadata.created).toBe('2026-10-22');
    expect(note.plainText).toBe('A & B');
  });

  it('reads a slides note and a todo note', () => {
    const slides = parseNote(
      document(
        [
          '<section class="slide extra" id="portada">',
          '<h1>Portada</h1>',
          '<aside class="notes"><p>Notas del ponente.</p></aside>',
          '</section>',
        ].join('\n'),
        { type: 'slides', title: 'Portada' },
      ),
    );
    const slideNote = requireNote(slides);
    expect(slides.ok).toBe(true);
    expect(slideNote.type).toBe('slides');
    expect(slideNote.sections[0]?.id).toBe('portada');
    expect(slideNote.sections[0]?.classes).toEqual(['slide', 'extra']);
    expect(slideNote.sections[0]?.heading?.text).toBe('Portada');
    expect(slideNote.sections[0]?.heading?.level).toBe(1);
    expect(slideNote.sections[0]?.plainText).toBe('Portada\nNotas del ponente.');

    const todo = parseNote(
      document(
        [
          '<ul class="tasks">',
          '<li data-g-task id="abierta" data-g-due="2026-10-22" data-g-priority="urgent">',
          '<input type="checkbox">',
          'Abierta',
          '</li>',
          '<li data-g-task id="hecha">',
          '<input type="checkbox" checked>',
          'Hecha',
          '</li>',
          '<li>No es una tarea</li>',
          '</ul>',
        ].join('\n'),
        { type: 'todo', title: 'Tareas' },
      ),
    );
    const todoNote = requireNote(todo);
    expect(todo.ok).toBe(true);
    expect(todoNote.tasks.map((task) => [task.id, task.checked, task.priority])).toEqual([
      ['abierta', false, 'urgent'],
      ['hecha', true, null],
    ]);
    expect(codes(todo)).not.toContain('E_TASK_INVALID');
    expect(todoNote.tasks[0]?.due).toBe('2026-10-22');
  });

  it('nests sections without inventing ids and keeps heading order', () => {
    const result = parseNote(
      document(
        [
          '<article>',
          '<section id="a">',
          '<h2>A</h2>',
          '<p>Alpha</p>',
          '<section id="b">',
          '<h3>B</h3>',
          '<p>Beta</p>',
          '</section>',
          '<h2>C</h2>',
          '<p>Gamma</p>',
          '</section>',
          '<section><h2>Sin id</h2><p>Delta</p></section>',
          '<h4>Aviso</h4>',
          '</article>',
        ].join('\n'),
      ),
    );
    const note = requireNote(result);
    expect(result.ok).toBe(true);
    expect(note.headings.map((heading) => heading.text)).toEqual([
      'A',
      'B',
      'C',
      'Sin id',
      'Aviso',
    ]);
    expect(note.headings[4]?.warning).toBe(true);
    expect(codes(result)).not.toContain('W_INLINE_STYLE_REMOVED');
    const parent = note.sections[0];
    const child = parent?.children[0];
    const unnamed = note.sections[1];
    expect(parent?.heading?.text).toBe('A');
    expect(parent?.plainText).toBe('A\nAlpha\nC\nGamma');
    expect(child?.id).toBe('b');
    expect(child?.plainText).toBe('B\nBeta');
    expect(note.plainText).toContain('Beta');
    expect(unnamed?.id).toBeNull();
    expect(unnamed?.heading?.text).toBe('Sin id');
  });
});

describe('parseNote links', () => {
  it('reads every wikilink form and ignores code', () => {
    const result = parseNote(
      document(
        [
          '<p>[[Título]] [[Título|texto]] [[Título#sección]] [[Título#sección|texto]]</p>',
          '<pre><code>[[No]]</code></pre>',
          '<p><code>[[Tampoco]]</code></p>',
        ].join('\n'),
      ),
    );
    const note = requireNote(result);
    expect(result.ok).toBe(true);
    expect(note.links.map((link) => link.wikilink)).toEqual([
      { raw: '[[Título]]', title: 'Título', section: null, label: null },
      { raw: '[[Título|texto]]', title: 'Título', section: null, label: 'texto' },
      { raw: '[[Título#sección]]', title: 'Título', section: 'sección', label: null },
      { raw: '[[Título#sección|texto]]', title: 'Título', section: 'sección', label: 'texto' },
    ]);
    expect(note.plainText).toContain('[[No]]');
  });

  it('classifies canonical, pending, external, and relative anchors', () => {
    const html = document(
      [
        `<p><a href="https://example.com/note" data-g-to="${TARGET_ID}" data-g-pending="Ignorado">Id</a></p>`,
        '<p><a href="https://example.com" rel="noopener">Example</a></p>',
        '<p><a href="../otras/nota.html">Otra</a></p>',
        '<p><a href="#intro">Intro</a></p>',
        `<p><a data-g-to="not-an-id">Malo</a></p>`,
      ].join('\n'),
    );
    const result = parseNote(html);
    const note = requireNote(result);
    expect(note.links.map((link) => link.kind)).toEqual([
      'canonical',
      'external',
      'relative',
      'relative',
      'canonical',
    ]);
    expect(note.links[0]).toMatchObject({
      ghost: false,
      targetId: TARGET_ID,
      pendingTitle: 'Ignorado',
      href: 'https://example.com/note',
    });
    expect(note.links[1]).toMatchObject({
      href: 'https://example.com',
      rel: 'noopener',
      ghost: false,
    });
    expect(note.links[2]).toMatchObject({ href: '../otras/nota.html', ghost: false });
    expect(note.links[3]).toMatchObject({ href: '#intro', kind: 'relative' });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'target-id' } }),
    );
    const line = html.split('\n').findIndex((part) => part.includes('data-g-to')) + 1;
    const sourceLine = html.split('\n')[line - 1];
    const column = sourceLine === undefined ? 0 : sourceLine.indexOf('<a') + 1;
    expect(note.links[0]?.location).toEqual({ line, column });
  });

  it('does not let a base element rewrite hrefs', () => {
    const result = parseNote(
      document('<p><a href="nota.html">Nota</a></p>', {
        extraHead: '<base href="https://evil.test/">',
      }),
    );
    const note = requireNote(result);
    expect(note.links[0]?.href).toBe('nota.html');
    expect(codes(result)).toContain('E_UNSAFE_ELEMENT');
    expect(result.ok).toBe(false);
  });
});

describe('parseNote metadata', () => {
  it('reports E_META_MISSING for each absent required field', () => {
    const cases = [
      ['title', { title: null }, 'title'],
      ['id', { id: null }, 'gaveta:id'],
      ['type', { type: null }, 'gaveta:type'],
      ['created', { created: null }, 'gaveta:created'],
    ] as const;
    for (const [label, options, field] of cases) {
      const result = parseNote(document('<article><h1>T</h1></article>', options));
      expect(result.ok, label).toBe(false);
      expect(result.note, label).not.toBeNull();
      expect(result.diagnostics, label).toContainEqual(
        expect.objectContaining({
          code: 'E_META_MISSING',
          severity: 'error',
          message: DIAGNOSTICS.E_META_MISSING.message,
          hint: DIAGNOSTICS.E_META_MISSING.hint,
          details: { field },
        }),
      );
    }
  });

  it('reports every missing field on an otherwise empty shell', () => {
    const result = parseNote(
      document('<p>x</p>', { title: null, id: null, type: null, created: null }),
    );
    expect(codes(result).filter((code) => code === 'E_META_MISSING')).toHaveLength(4);
    expect(requireNote(result).plainText).toBe('x');
  });

  it('rejects invalid id, type, created, and updated values', () => {
    const result = parseNote(
      document('<p>Hola</p>', {
        id: 'not-a-ulid',
        type: 'Doc',
        created: 'ayer',
        updated: 'mañana',
      }),
    );
    const note = requireNote(result);
    expect(result.ok).toBe(false);
    expect(note.id).toBe('not-a-ulid');
    expect(note.type).toBeNull();
    expect(note.metadata.rawType).toBe('Doc');
    expect(note.metadata.created).toBe('ayer');
    expect(note.metadata.updated).toBe('mañana');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'id' } }),
        expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'type' } }),
        expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'created' } }),
        expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'updated' } }),
      ]),
    );
  });

  it('keeps the first meta value and reports a conflicting duplicate', () => {
    const conflict = parseNote(
      document('<p>Hola</p>', { extraHead: metaTag('gaveta:id', OTHER_ID) }),
    );
    expect(requireNote(conflict).id).toBe(NOTE_ID);
    expect(conflict.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'duplicate', field: 'gaveta:id' },
      }),
    );

    const same = parseNote(document('<p>Hola</p>', { extraHead: metaTag('gaveta:id', NOTE_ID) }));
    expect(same.ok).toBe(true);

    const spaced = parseNote(
      document('<p>Hola</p>', {
        type: ' slides ',
        extraHead: '<meta name="Gaveta:Tags" content="uno, dos">',
      }),
    );
    const note = requireNote(spaced);
    expect(spaced.ok).toBe(true);
    expect(note.type).toBe('slides');
    expect(note.metadata.tags).toEqual(['uno', 'dos']);
  });

  it('ignores titles and meta hidden in svg or template', () => {
    const result = parseNote(
      document(
        '<svg><title>Gráfico</title></svg><template><meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHI"></template><p>Visible</p>',
      ),
    );
    const note = requireNote(result);
    expect(result.ok).toBe(true);
    expect(note.title).toBe('Gaveta — PRD');
    expect(note.id).toBe(NOTE_ID);
    expect(note.plainText).toContain('Gráfico');
    expect(note.plainText).toContain('Visible');
  });
});

describe('parseNote security', () => {
  const marker = '__gaveta_parser_executed';

  it('reports unsafe elements, handlers, and javascript URLs without executing them', () => {
    const globalRecord = globalThis as Record<string, unknown>;
    globalRecord[marker] = false;
    const newlineUrl = 'java\nscript:alert(1)';
    const html = document(
      [
        `<script>globalThis['${marker}']=true</script>`,
        '<img src="x" OnError="globalThis[\'' + marker + '\']=true" onload="also">',
        '<a href="javascript&#58;alert(1)" onclick="nope">x</a>',
        `<a href="${newlineUrl}">y</a>`,
        '<iframe src="javascript:alert(3)"></iframe>',
        '<object data="javascript:alert(4)"></object>',
        '<embed src="javascript:alert(5)">',
        '<form action="javascript:alert(6)"></form>',
        '<svg onload="globalThis[\'' + marker + '\']=true"></svg>',
        '<img srcset="javascript:alert(7) 1x, a.png 2x">',
        "<!-- <script>globalThis['" + marker + "']=true</script> -->",
        '<p style="color:red">estilo</p>',
        '<div>bloque</div>',
        '<img src="https://evil.test/pixel.png" alt="remoto">',
      ].join('\n'),
      { extraHead: '<meta http-equiv="refresh" content="0;url=javascript:alert(8)">' },
    );
    const result = parseNote(html);
    const note = requireNote(result);

    expect(globalRecord[marker]).toBe(false);
    expect(result.ok).toBe(false);
    expect(note.diagnostics).toBe(result.diagnostics);
    expect(note.plainText).not.toContain(marker);
    expect(note.plainText).toContain('estilo');
    expect(note.plainText).toContain('bloque');
    expect(codes(result)).toEqual([
      'E_UNSAFE_URL',
      'E_UNSAFE_SCRIPT',
      'E_UNSAFE_HANDLER',
      'E_UNSAFE_HANDLER',
      'E_UNSAFE_URL',
      'E_UNSAFE_HANDLER',
      'E_UNSAFE_URL',
      'E_UNSAFE_ELEMENT',
      'E_UNSAFE_URL',
      'E_UNSAFE_ELEMENT',
      'E_UNSAFE_URL',
      'E_UNSAFE_ELEMENT',
      'E_UNSAFE_URL',
      'E_UNSAFE_ELEMENT',
      'E_UNSAFE_URL',
      'E_UNSAFE_HANDLER',
      'E_UNSAFE_URL',
    ]);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'E_UNSAFE_URL',
      details: { element: 'meta', attribute: 'content' },
    });
    expect(result.diagnostics[1]).toMatchObject({
      code: 'E_UNSAFE_SCRIPT',
      message: DIAGNOSTICS.E_UNSAFE_SCRIPT.message,
      hint: DIAGNOSTICS.E_UNSAFE_SCRIPT.hint,
      details: { element: 'script' },
    });
    expect(result.diagnostics[2]).toMatchObject({
      code: 'E_UNSAFE_HANDLER',
      details: { element: 'img', attribute: 'onerror' },
    });
    expect(note.links.some((link) => link.href === 'javascript:alert(1)')).toBe(true);
    expect(codes(result)).not.toContain('W_REMOTE_RESOURCE');
    expect(codes(result)).not.toContain('W_INLINE_STYLE_REMOVED');
  });

  it('treats a javascript URL hidden behind a control character as unsafe', () => {
    const result = parseNote(document('<a href="\u0001javascript:alert(1)">x</a>'));
    expect(codes(result)).toContain('E_UNSAFE_URL');
    expect(requireNote(result).links[0]?.href).toContain('javascript:');
  });

  it('sees scripts inside noscript and template', () => {
    const result = parseNote(
      document(
        '<noscript><script>alert(1)</script><p>visible</p></noscript><template><script>alert(2)</script><p>hidden</p></template>',
      ),
    );
    const note = requireNote(result);
    expect(codes(result).filter((code) => code === 'E_UNSAFE_SCRIPT')).toHaveLength(2);
    expect(note.plainText).toContain('visible');
    expect(note.plainText).not.toContain('hidden');
    expect(note.plainText).not.toContain('alert(2)');
  });

  it('does not treat an https refresh or a remote image as an unsafe url', () => {
    const result = parseNote(
      document('<img src="https://evil.test/x.png" alt="x"><p>ok</p>', {
        extraHead: '<meta http-equiv="refresh" content="0;url=https://evil.test">',
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});

describe('parseNote adversarial input', () => {
  it('rejects values that are not strings', () => {
    const inputs: unknown[] = [
      null,
      undefined,
      0,
      1,
      true,
      false,
      {},
      [],
      () => undefined,
      Symbol('x'),
    ];
    const bytes = new Uint8Array([60, 112, 62, 72, 105]);
    inputs.push(bytes);
    for (const input of inputs) {
      const result = parseNote(input);
      expect(result.ok).toBe(false);
      expect(result.note).toBeNull();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'E_HTML_INVALID',
          message: DIAGNOSTICS.E_HTML_INVALID.message,
          details: { reason: 'input' },
        }),
      ]);
    }
  });

  it('rejects HTML above the size cap and still parses input at the cap', () => {
    const over = 'a'.repeat(MAX_NOTE_HTML_CHARS + 1);
    const rejected = parseNote(over);
    expect(rejected.note).toBeNull();
    expect(rejected.diagnostics).toEqual([
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'size', length: MAX_NOTE_HTML_CHARS + 1 },
      }),
    ]);

    const atCap = parseNote(`${'a'.repeat(MAX_NOTE_HTML_CHARS - 1)}b`);
    expect(atCap.note).not.toBeNull();
    expect(atCap.diagnostics.some((diagnostic) => diagnostic.details?.reason === 'size')).toBe(
      false,
    );
    expect(codes(atCap)).toContain('E_META_MISSING');
  });

  it('accepts a leading BOM on an otherwise valid note', () => {
    const result = parseNote(`\uFEFF${document('<p>Hola</p>')}`);
    expect(result.ok).toBe(true);
    expect(requireNote(result).plainText).toBe('Hola');
  });

  it('returns structured errors for malformed markup and does not throw', () => {
    const samples = [
      '',
      '   \n',
      '<<<not html',
      '<html',
      '<p>unterminated',
      '\u0000\u0001<script>alert(1)</script>',
    ];
    for (const sample of samples) {
      let result: ParseResult | undefined;
      expect(() => {
        result = parseNote(sample);
      }).not.toThrow();
      if (result === undefined) {
        throw new Error('parser returned nothing');
      }
      expect(result.ok).toBe(false);
      expect(result.note).not.toBeNull();
      expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
    }
    const broken = parseNote('<<<not html');
    const markup = broken.diagnostics.find((diagnostic) => diagnostic.code === 'E_HTML_INVALID');
    expect(markup?.details?.reason).toBe('markup');
    const nul = parseNote('\u0000<script>alert(1)</script>');
    expect(codes(nul)).toContain('E_UNSAFE_SCRIPT');
  });

  it('survives deep nesting, reports it, and still sees a buried script', () => {
    const globalRecord = globalThis as Record<string, unknown>;
    const marker = '__gaveta_parser_executed';
    globalRecord[marker] = false;
    const depth = Math.max(2000, MAX_NOTE_DEPTH + 50);
    const body = [
      '<article>',
      '<section id="intro"><h2>Intro</h2><p>Safe</p></section>',
      '<div>'.repeat(depth),
      `<script>globalThis['${marker}']=true; SECRET_PAYLOAD</script>`,
      `<img src="x" onerror="globalThis['${marker}']=true">`,
      '</div>'.repeat(depth),
      '</article>',
    ].join('');
    const result = parseNote(document(body, { title: 'Deep' }));
    const note = requireNote(result);
    expect(globalRecord[marker]).toBe(false);
    expect(result.ok).toBe(false);
    expect(note.title).toBe('Deep');
    expect(note.sections[0]?.id).toBe('intro');
    expect(note.plainText).toContain('Safe');
    expect(note.plainText).not.toContain('SECRET_PAYLOAD');
    expect(result.diagnostics[0]?.code).toBe('E_HTML_INVALID');
    expect(result.diagnostics[0]?.details?.reason).toBe('depth');
    const depthDetail = result.diagnostics[0]?.details?.depth;
    expect(typeof depthDetail).toBe('number');
    if (typeof depthDetail === 'number') {
      expect(depthDetail).toBeGreaterThan(MAX_NOTE_DEPTH);
    }
    expect(codes(result)).toContain('E_UNSAFE_SCRIPT');
    expect(codes(result)).toContain('E_UNSAFE_HANDLER');
  });

  it('does not hang on a long unclosed wikilink', () => {
    const result = parseNote(document(`<p>${'['.repeat(20_000)}</p>`));
    expect(requireNote(result).links).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
