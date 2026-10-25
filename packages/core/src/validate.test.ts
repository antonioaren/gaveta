import { describe, expect, it } from 'vitest';
import {
  COMPONENTS,
  LINKS,
  MAX_NOTE_DEPTH,
  MAX_NOTE_HTML_CHARS,
  NOTE_TYPE_STRUCTURES,
  exitCodeFor,
  formatDiagnostic,
  validateNote,
  validateVault,
  type NoteModel,
  type ValidationResult,
} from './index.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const TARGET_ID = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const OTHER_ID = '01JB9C3N5S8D0E2F4G6H8J1K2M';

interface Shell {
  readonly title?: string | null;
  readonly id?: string | null;
  readonly type?: string | null;
  readonly created?: string | null;
  readonly extraHead?: string;
  readonly doctype?: boolean;
  readonly lang?: string | null;
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
  if (typeof options.extraHead === 'string') {
    head.push(options.extraHead);
  }
  const lang = options.lang === null ? '' : ` lang="${options.lang ?? 'es'}"`;
  const lines = [
    ...(options.doctype === false ? [] : ['<!doctype html>']),
    `<html${lang}>`,
    '<head>',
    head.join('\n'),
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ];
  return lines.join('\n');
}

function requireNote(result: ValidationResult): NoteModel {
  expect(result.note).not.toBeNull();
  if (result.note === null) {
    throw new Error('expected a note model');
  }
  return result.note;
}

function codes(result: ValidationResult): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function doc(inner: string, options: Shell = {}): string {
  return document(
    `<article><h1>Título</h1><section id="resumen"><h2>Resumen</h2>${inner}</section></article>`,
    options,
  );
}

const RICH_DOC = [
  '<article>',
  '<header><h1>Título</h1></header>',
  '<nav><p><a href="#resumen">Resumen</a></p></nav>',
  '<section id="resumen">',
  '<h2>Resumen</h2>',
  '<p>Texto <strong>fuerte</strong> <em>cursiva</em> <code>x</code> <kbd>Ctrl</kbd> <mark>m</mark> <sub>s</sub> <sup>p</sup> <small>c</small> <abbr title="Gaveta">G</abbr> <time datetime="2026-10-22">hoy</time> <span>s</span>.</p>',
  '<blockquote><p>Cita</p></blockquote>',
  '<ul><li>Uno</li></ul>',
  '<ol><li>Dos</li></ol>',
  '<dl><dt>Término</dt><dd>Definición</dd></dl>',
  '<hr>',
  '<p>Línea<br>nueva</p>',
  '<h3>Detalle</h3>',
  '<h4>Aviso</h4>',
  '<h5>Más</h5>',
  '<h6>Fino</h6>',
  '<aside class="callout" data-kind="warn"><p>Cuidado</p></aside>',
  '<aside class="notes"><p>Notas</p></aside>',
  '<table><caption>Datos</caption><thead><tr><th colspan="2">Clave</th></tr></thead><tbody><tr><td rowspan="1">Valor</td><td>2</td></tr></tbody></table>',
  '<figure><picture><source src="attachments/diagrama.png" type="image/png"><img src="attachments/diagrama.png" alt="Diagrama"></picture><figcaption>Diagrama</figcaption></figure>',
  '<pre class="mermaid">graph LR\n  A-->B</pre>',
  '<pre><code class="language-ts">const vault = true;</code></pre>',
  '<pre><code class="language-c++">int x;</code></pre>',
  '<p><a href="otra.html" data-g-to="' + TARGET_ID + '" rel="depends-on">Otra</a></p>',
  '<ul class="tasks"><li data-g-task id="revisar" data-g-due="2026-10-22" data-g-priority="high"><input type="checkbox" checked>Revisar</li></ul>',
  '<p data-g-custom="1">Extra</p>',
  '</section>',
  '<footer><p>Fin</p></footer>',
  '</article>',
].join('\n');

describe('validateNote happy path', () => {
  it('accepts a document that uses the contract elements, components, and a canonical link', () => {
    const result = validateNote(document(RICH_DOC), { notePath: 'notas/prd.html' });
    const note = requireNote(result);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(note.diagnostics).toBe(result.diagnostics);
    expect(note.title).toBe('Gaveta — PRD');
    expect(note.id).toBe(NOTE_ID);
    expect(note.type).toBe('doc');
    expect(note.links.map((link) => link.kind)).toEqual(['relative', 'canonical']);
    expect(note.tasks).toHaveLength(1);
    expect(note.tasks[0]).toMatchObject({ id: 'revisar', checked: true, due: '2026-10-22' });
    const warned = note.headings
      .filter((heading) => heading.warning)
      .map((heading) => heading.level);
    expect(warned).toEqual([4, 5, 6]);
    expect(codes(result).some((code) => code.startsWith('W_'))).toBe(false);
  });

  it('accepts a leading BOM and whitespace before the doctype', () => {
    const html = `\uFEFF\n${document('<article><h1>T</h1><p>Hola</p></article>')}`;
    const result = validateNote(html);
    expect(result.ok).toBe(true);
    expect(requireNote(result).plainText).toContain('Hola');
  });

  it('accepts each type example and each component example from the contract', () => {
    for (const type of ['doc', 'slides', 'todo'] as const) {
      const example = NOTE_TYPE_STRUCTURES[type].example;
      const result = validateNote(document(example, { type }), { notePath: 'notas/ejemplo.html' });
      expect(result.ok, type).toBe(true);
      expect(result.diagnostics, type).toEqual([]);
    }

    for (const component of COMPONENTS) {
      const result = validateNote(doc(component.example), { notePath: 'nota.html' });
      expect(result.ok, component.id).toBe(true);
      expect(result.diagnostics, component.id).toEqual([]);
    }

    const canonical = validateNote(doc(LINKS.canonical.example), { notePath: 'notas/prd.html' });
    expect(canonical.ok).toBe(true);
    expect(canonical.diagnostics).toEqual([]);

    const external = validateNote(doc(LINKS.external.example));
    expect(external.ok).toBe(true);
    expect(codes(external)).not.toContain('W_REMOTE_RESOURCE');

    const pending = validateNote(doc(LINKS.pending.example));
    expect(pending.ok).toBe(true);
    expect(codes(pending)).toEqual(['W_LINK_PENDING']);
    expect(pending.diagnostics[0]).toMatchObject({
      severity: 'warning',
      message: formatDiagnostic('W_LINK_PENDING').message,
      hint: formatDiagnostic('W_LINK_PENDING').hint,
      details: { title: 'Roadmap' },
    });
  });

  it('leaves raw wikilinks for the resolver and does not warn', () => {
    const result = validateNote(doc('<p>Ver [[Roadmap#plan|el plan]]</p>'));
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(requireNote(result).links[0]).toMatchObject({
      kind: 'wikilink',
      pendingTitle: 'Roadmap',
    });
  });

  it('does not require a section, and does not require speaker notes on a slide', () => {
    const bare = validateNote(document('<article><h1>Título</h1><p>Texto.</p></article>'));
    expect(bare.ok).toBe(true);
    const slides = validateNote(
      document('<section class="slide"><h1>Portada</h1></section>', { type: 'slides' }),
    );
    expect(slides.ok).toBe(true);
    const customId = validateNote(
      document('<article><h1>T</h1><section id="xyz"><h2>Resumen</h2></section></article>'),
    );
    expect(customId.ok).toBe(true);
  });
});

describe('validateNote contract rules', () => {
  it('reports an element outside the contract with a Spanish catalog message and a location', () => {
    const result = validateNote(doc('<div>bloque</div>'));
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['E_HTML_INVALID']);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'E_HTML_INVALID',
      severity: 'error',
      message: formatDiagnostic('E_HTML_INVALID').message,
      hint: formatDiagnostic('E_HTML_INVALID').hint,
      details: { reason: 'element', element: 'div' },
    });
    const location = result.diagnostics[0]?.location;
    if (location === null || location === undefined) {
      throw new Error('missing location');
    }
    expect(location.line).toBeGreaterThan(0);
    expect(location.column).toBeGreaterThan(0);
    expect(requireNote(result).plainText).toContain('bloque');
  });

  it('reports unknown attributes, classes, span classes, and known data attributes on the wrong element', () => {
    const attribute = validateNote(doc('<p tabindex="1">x</p>'));
    expect(attribute.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'attribute', element: 'p', attribute: 'tabindex' },
      }),
    );

    const calloutOnP = validateNote(doc('<p class="callout">x</p>'));
    expect(calloutOnP.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'class', element: 'p', class: 'callout' },
      }),
    );

    const span = validateNote(doc('<p><span class="callout">x</span></p>'));
    expect(span.ok).toBe(false);
    expect(codes(span)).toContain('E_HTML_INVALID');

    const bareSpan = validateNote(doc('<p><span>x</span></p>'));
    expect(bareSpan.ok).toBe(true);

    const knownData = validateNote(doc('<p data-g-to="01JB7Z3K9QX4T5M2N8V6R0WYHC">x</p>'));
    expect(knownData.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'attribute', element: 'p', attribute: 'data-g-to' },
      }),
    );
  });

  it('rejects a missing doctype, a non-utf-8 charset, and meta that is not part of the shell', () => {
    const doctype = validateNote(document('<article><h1>T</h1></article>', { doctype: false }));
    expect(doctype.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'doctype' } }),
    );

    const charset = validateNote(
      document('<article><h1>T</h1></article>', {
        extraHead: '<meta charset="latin1">',
      }),
    );
    expect(charset.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'charset' } }),
    );

    const described = validateNote(
      document('<article><h1>T</h1></article>', {
        extraHead: '<meta name="description" content="hola">',
      }),
    );
    expect(described.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'meta' } }),
    );

    const icon = validateNote(
      document('<article><h1>T</h1></article>', {
        extraHead: '<link rel="icon" href="favicon.ico">',
      }),
    );
    expect(icon.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'link' } }),
    );
  });

  it('requires the structure of each note type', () => {
    const docMissing = validateNote(document('<p>Solo un párrafo.</p>', { type: 'doc' }));
    expect(docMissing.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_TYPE_STRUCTURE',
        message: formatDiagnostic('E_TYPE_STRUCTURE').message,
        details: { reason: 'required', type: 'doc', element: 'article', className: '' },
      }),
    );

    const slidesMissing = validateNote(
      document('<article><h1>Portada</h1></article>', { type: 'slides' }),
    );
    expect(slidesMissing.ok).toBe(false);
    expect(slidesMissing.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_TYPE_STRUCTURE',
        details: { reason: 'required', type: 'slides', element: 'section', className: 'slide' },
      }),
    );

    const todoMissing = validateNote(
      document('<article><h1>Lista</h1></article>', { type: 'todo' }),
    );
    expect(todoMissing.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_TYPE_STRUCTURE',
        details: { reason: 'required', type: 'todo', element: 'ul', className: 'tasks' },
      }),
    );

    const missingSectionId = validateNote(
      document(
        '<article><h1>T</h1><section><h2>Resumen</h2></section><section><h2>Otro</h2></section></article>',
      ),
    );
    expect(
      missingSectionId.diagnostics.filter(
        (diagnostic) => diagnostic.details?.reason === 'section-id',
      ),
    ).toHaveLength(2);
  });

  it('checks callouts, embeds, ids, table spans, and time values', () => {
    const missingKind = validateNote(doc('<aside class="callout"><p>x</p></aside>'));
    expect(missingKind.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'kind', element: 'aside' },
      }),
    );
    const badKind = validateNote(doc('<aside class="callout" data-kind="bogus"><p>x</p></aside>'));
    expect(codes(badKind)).toContain('E_HTML_INVALID');
    const kindOnPlain = validateNote(doc('<aside data-kind="info"><p>x</p></aside>'));
    expect(kindOnPlain.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'kind', element: 'aside' },
      }),
    );
    const bothKinds = validateNote(
      doc(
        '<aside class="callout" data-kind="info"><p>Bien</p></aside><aside class="callout" data-kind="warn"><p>Mal</p></aside>',
      ),
    );
    expect(bothKinds.ok).toBe(true);

    const embed = validateNote(doc('<gaveta-embed></gaveta-embed>'));
    expect(embed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'embed', element: 'gaveta-embed' },
      }),
    );
    const badEmbed = validateNote(doc('<gaveta-embed data-g-to="not-a-ulid"></gaveta-embed>'));
    expect(badEmbed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'id', element: 'gaveta-embed' },
      }),
    );

    const duplicate = validateNote(
      document(
        '<article><h1>T</h1><section id="misma"><h2 id="misma">Resumen</h2></section></article>',
      ),
    );
    expect(duplicate.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'duplicate-id', id: 'misma' },
      }),
    );
    const spaced = validateNote(doc('<p id="a b">x</p>'));
    expect(spaced.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'id', element: 'p' },
      }),
    );

    const span = validateNote(
      doc('<table><tr><th colspan="0">A</th><td rowspan="2.5">B</td></tr></table>'),
    );
    expect(span.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'colspan', element: 'th' },
      }),
    );
    expect(span.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'rowspan', element: 'td' },
      }),
    );

    const time = validateNote(doc('<p><time datetime="hoy">hoy</time></p>'));
    expect(time.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'datetime', element: 'time' },
      }),
    );
    const dated = validateNote(doc('<p><time datetime="2026-10-22T10:00:00Z">hoy</time></p>'));
    expect(dated.ok).toBe(true);

    const image = validateNote(doc('<p><img src="a.png"></p>'));
    expect(image.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'alt', element: 'img' },
      }),
    );
    const sourceless = validateNote(doc('<p><img alt="nada"></p>'));
    expect(sourceless.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'src', element: 'img' },
      }),
    );

    const language = validateNote(doc('<pre><code class="lang-ts">x</code></pre>'));
    expect(language.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'class', element: 'code', class: 'lang-ts' },
      }),
    );
  });

  it('validates tasks against due, priority, id, checkbox, and list placement', () => {
    const badDue = validateNote(
      document(
        '<ul class="tasks"><li data-g-task id="fecha" data-g-due="not-a-date" data-g-priority="urgent"><input type="text">Fecha</li></ul>',
        { type: 'todo' },
      ),
    );
    expect(badDue.ok).toBe(false);
    expect(badDue.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'E_TASK_INVALID',
          message: formatDiagnostic('E_TASK_INVALID').message,
          hint: formatDiagnostic('E_TASK_INVALID').hint,
          details: { reason: 'due' },
        }),
        expect.objectContaining({ code: 'E_TASK_INVALID', details: { reason: 'priority' } }),
        expect.objectContaining({ code: 'E_TASK_INVALID', details: { reason: 'checkbox' } }),
      ]),
    );

    const missingId = validateNote(
      document('<ul class="tasks"><li data-g-task><input type="checkbox">Sin id</li></ul>', {
        type: 'todo',
      }),
    );
    expect(missingId.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_TASK_INVALID', details: { reason: 'id' } }),
    );

    const missingBox = validateNote(
      document('<ul class="tasks"><li data-g-task id="sola">Sin caja</li></ul>', { type: 'todo' }),
    );
    expect(missingBox.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_TASK_INVALID', details: { reason: 'checkbox' } }),
    );

    const twoBoxes = validateNote(
      document(
        '<ul class="tasks"><li data-g-task id="doble"><input type="checkbox"><input type="checkbox">Dos</li></ul>',
        { type: 'todo' },
      ),
    );
    expect(twoBoxes.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_TASK_INVALID', details: { reason: 'checkbox' } }),
    );

    const outside = validateNote(
      document(
        '<article><h1>T</h1><ol><li data-g-task id="fuera"><input type="checkbox">Fuera</li></ol></article>',
      ),
    );
    expect(outside.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_TASK_INVALID', details: { reason: 'parent' } }),
    );

    const plain = validateNote(document('<ul class="tasks"><li>Texto</li></ul>', { type: 'todo' }));
    expect(plain.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_TASK_INVALID', details: { reason: 'child' } }),
    );

    const stray = validateNote(doc('<p><input type="checkbox" name="dato"></p>'));
    expect(stray.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'input', element: 'input' },
      }),
    );
    expect(stray.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'attribute', element: 'input', attribute: 'name' },
      }),
    );

    const looseDue = validateNote(doc('<ul><li data-g-due="not-a-date">x</li></ul>'));
    expect(looseDue.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_TASK_INVALID', details: { reason: 'due' } }),
    );

    const optional = validateNote(
      document(
        '<ul class="tasks"><li data-g-task id="abierta"><input type="CHECKBOX">Abierta</li></ul>',
        {
          type: 'todo',
        },
      ),
    );
    expect(optional.ok).toBe(true);
  });

  it('checks link shape, noopener, vocabulary, and strict rel', () => {
    const empty = validateNote(doc('<p><a>nada</a></p>'));
    expect(empty.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'anchor', element: 'a' },
      }),
    );

    const noHref = validateNote(doc(`<p><a data-g-to="${TARGET_ID}">sin href</a></p>`));
    expect(noHref.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'href', element: 'a' },
      }),
    );

    const conflict = validateNote(
      doc(`<p><a href="otra.html" data-g-to="${TARGET_ID}" data-g-pending="Otra">x</a></p>`),
      { notePath: 'nota.html' },
    );
    expect(conflict.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'conflict', element: 'a' },
      }),
    );

    const remote = validateNote(doc('<p><a href="https://example.com">Example</a></p>'));
    expect(remote.ok).toBe(false);
    expect(remote.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'noopener', element: 'a' },
      }),
    );
    expect(codes(remote)).not.toContain('W_REMOTE_RESOURCE');

    const target = validateNote(
      doc('<p><a href="https://example.com" rel="noopener" target="_blank">Example</a></p>'),
    );
    expect(target.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'attribute', element: 'a', attribute: 'target' },
      }),
    );
    expect(codes(target)).not.toContain('W_REL_UNKNOWN');

    const unknown = validateNote(
      doc(`<p><a href="otra.html" data-g-to="${TARGET_ID}" rel="primo">Otra</a></p>`),
      { notePath: 'nota.html' },
    );
    expect(unknown.ok).toBe(true);
    expect(unknown.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'W_REL_UNKNOWN',
        severity: 'warning',
        message: formatDiagnostic('W_REL_UNKNOWN').message,
        hint: formatDiagnostic('W_REL_UNKNOWN').hint,
        details: { rel: 'primo' },
      }),
    );
    expect(exitCodeFor('W_REL_UNKNOWN', { strictRel: true })).toBe(2);

    const strict = validateNote(
      doc(`<p><a href="otra.html" data-g-to="${TARGET_ID}" rel="primo">Otra</a></p>`),
      { notePath: 'nota.html', strictRel: true },
    );
    expect(strict.ok).toBe(false);
    expect(strict.diagnostics[0]).toMatchObject({ code: 'W_REL_UNKNOWN', severity: 'error' });

    const custom = validateNote(
      doc(`<p><a href="otra.html" data-g-to="${TARGET_ID}" rel="amigo">Otra</a></p>`),
      { notePath: 'nota.html', relVocabulary: ['amigo'] },
    );
    expect(custom.ok).toBe(true);
    expect(custom.diagnostics).toEqual([]);

    const closed = validateNote(
      doc(`<p><a href="otra.html" data-g-to="${TARGET_ID}" rel="related">Otra</a></p>`),
      { notePath: 'nota.html', relVocabulary: [] },
    );
    expect(codes(closed)).toContain('W_REL_UNKNOWN');

    const safeRel = validateNote(
      doc('<p><a href="https://example.com" rel="noopener noreferrer">Example</a></p>'),
    );
    expect(safeRel.ok).toBe(true);
  });
});

describe('validateNote security', () => {
  const marker = '__gaveta_validate_executed';

  it('reports unsafe content from the parser without executing it or fetching it', () => {
    const globalRecord = globalThis as Record<string, unknown>;
    globalRecord[marker] = false;
    const calls: unknown[] = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (input: unknown) => {
      calls.push(input);
      return Promise.reject(new Error('network'));
    };
    try {
      const html = document(
        [
          `<script>globalThis['${marker}']=true</script>`,
          '<img src="x.png" alt="" onerror="globalThis[\'' + marker + '\']=true">',
          '<a href="javascript:alert(1)">x</a>',
          '<a href="JAVASCRIPT:alert(1)">y</a>',
          '<a href=" javascript:alert(1)">z</a>',
          '<iframe src="https://evil.example/frame.html"></iframe>',
          '<object data="https://evil.example/plugin.swf"></object>',
          '<embed src="https://evil.example/plugin.swf">',
          '<form action="https://evil.example/collect"></form>',
          '<p style="width: expression(globalThis[\'' + marker + '\']=true)">css</p>',
          "<!-- <script>globalThis['" + marker + "']=true</script> -->",
        ].join('\n'),
        { extraHead: '<base href="https://evil.example/">' },
      );
      let result: ValidationResult | undefined;
      expect(() => {
        result = validateNote(html, { notePath: 'nota.html' });
      }).not.toThrow();
      if (result === undefined) {
        throw new Error('validator returned nothing');
      }
      expect(globalRecord[marker]).toBe(false);
      expect(calls).toEqual([]);
      expect(result.ok).toBe(false);
      expect(requireNote(result).plainText).toContain('css');
      expect(requireNote(result).plainText).not.toContain(marker);
      for (const code of [
        'E_UNSAFE_SCRIPT',
        'E_UNSAFE_HANDLER',
        'E_UNSAFE_URL',
        'E_UNSAFE_ELEMENT',
        'W_REMOTE_RESOURCE',
        'W_INLINE_STYLE_REMOVED',
      ]) {
        expect(codes(result), code).toContain(code);
      }
      expect(codes(result).filter((code) => code === 'E_UNSAFE_URL')).toHaveLength(3);
      expect(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'E_UNSAFE_SCRIPT' && diagnostic.details?.reason === 'expression',
        ),
      ).toBe(false);
    } finally {
      globalThis.fetch = previousFetch;
      Reflect.deleteProperty(globalRecord, marker);
    }
  });

  it('warns on remote resources, honours the allowlist, and flags javascript hidden in style', () => {
    const remote = validateNote(
      doc(
        [
          '<p><img src="https://evil.example/a.png" alt="a"></p>',
          '<p><img src="http://evil.example/b.png" alt="b"></p>',
          '<p><img src="//evil.example/c.png" alt="c"></p>',
          '<p><img src="local.png" srcset="local.png 1x, https://evil.example/2x.png 2x" alt="d"></p>',
          '<picture><source src="https://evil.example/e.png" type="image/png"></picture>',
          '<p foo:href="https://evil.example/f"></p>',
        ].join(''),
      ),
      { notePath: 'nota.html' },
    );
    expect(remote.ok).toBe(false);
    expect(
      codes(remote).filter((code) => code === 'W_REMOTE_RESOURCE').length,
    ).toBeGreaterThanOrEqual(6);
    expect(remote.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'attribute', element: 'img', attribute: 'srcset' },
      }),
    );
    const remoteImage = remote.diagnostics.find((diagnostic) => {
      const details = diagnostic.details;
      return (
        diagnostic.code === 'W_REMOTE_RESOURCE' &&
        details !== null &&
        details.element === 'img' &&
        details.attribute === 'src'
      );
    });
    expect(remoteImage?.message).toBe(formatDiagnostic('W_REMOTE_RESOURCE').message);
    expect(remoteImage?.hint).toBe(formatDiagnostic('W_REMOTE_RESOURCE').hint);

    const allowed = validateNote(doc('<p><img src="https://cdn.example/a.png" alt="a"></p>'), {
      remoteAllowlist: ['CDN.Example', 'https://other.example/path'],
    });
    expect(codes(allowed)).not.toContain('W_REMOTE_RESOURCE');

    const subdomain = validateNote(
      doc('<p><img src="https://img.cdn.example/a.png" alt="a"></p>'),
      {
        remoteAllowlist: ['cdn.example'],
      },
    );
    expect(codes(subdomain)).toContain('W_REMOTE_RESOURCE');

    const dataImage = validateNote(doc('<p><img src="data:image/png;base64,aaaa" alt="a"></p>'));
    expect(dataImage.ok).toBe(true);

    const styled = validateNote(
      doc(
        '<p style="background: url(https://evil.example/bg.png)">a</p><p style="color: url(\'javascript:alert(1)\')">b</p>',
      ),
    );
    expect(styled.ok).toBe(false);
    const styleWarnings = styled.diagnostics.filter(
      (diagnostic) => diagnostic.code === 'W_INLINE_STYLE_REMOVED',
    );
    expect(styleWarnings).toHaveLength(1);
    expect(styleWarnings[0]).toMatchObject({
      message: formatDiagnostic('W_INLINE_STYLE_REMOVED', { count: 2 }).message,
      details: { count: 2 },
    });
    expect(codes(styled)).toContain('W_REMOTE_RESOURCE');
    expect(styled.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_UNSAFE_URL',
        message: formatDiagnostic('E_UNSAFE_URL').message,
        details: { element: 'p', attribute: 'style' },
      }),
    );
    expect(codes(styled).filter((code) => code === 'E_UNSAFE_URL')).toHaveLength(1);

    const imported = validateNote(
      document('<article><h1>T</h1></article>', {
        extraHead: '<style>@import "https://evil.example/x.css";</style>',
      }),
    );
    expect(imported.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'element', element: 'style' },
      }),
    );
    expect(codes(imported)).toContain('W_REMOTE_RESOURCE');

    const refresh = validateNote(
      document('<article><h1>T</h1><section id="s"><h2>S</h2></section></article>', {
        extraHead: '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
      }),
    );
    expect(refresh.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'meta-refresh' } }),
    );
    expect(codes(refresh)).toContain('W_REMOTE_RESOURCE');

    const refreshScript = validateNote(
      document('<article><h1>T</h1></article>', {
        extraHead: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      }),
    );
    expect(codes(refreshScript).filter((code) => code === 'E_UNSAFE_URL')).toHaveLength(1);
    expect(refreshScript.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'meta-refresh' } }),
    );
  });

  it('rejects references that leave the vault and keeps in-vault relative links', () => {
    const html = doc(
      [
        '<p><a href="../nota.html">cerca</a></p>',
        '<p><a href="../../fuera.html">lejos</a></p>',
        '<p><a href="/etc/passwd">passwd</a></p>',
        '<p><a href="..\\..\\fuera.html">windows</a></p>',
        '<p><img src="attachments/../../fuera.png" alt="adjunto"></p>',
        '<p><img src="file:///etc/passwd" alt="file"></p>',
        '<p><a href="%2e%2e/%2e%2e/secret.html">codificado</a></p>',
        '<p><a href="%252e%252e/secret.html">doble</a></p>',
        '<p><a href="100%.html">literal</a></p>',
        '<p><a href="C:/Windows/system.ini">unidad</a></p>',
      ].join(''),
    );
    const nested = validateNote(html, { notePath: 'docs/nota.html' });
    expect(codes(nested).filter((code) => code === 'E_PATH_OUTSIDE_VAULT')).toHaveLength(6);
    expect(nested.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_PATH_OUTSIDE_VAULT',
        message: formatDiagnostic('E_PATH_OUTSIDE_VAULT').message,
        hint: formatDiagnostic('E_PATH_OUTSIDE_VAULT').hint,
      }),
    );
    const root = validateNote(doc('<p><a href="../nota.html">x</a></p>'), {
      notePath: 'nota.html',
    });
    expect(codes(root)).toContain('E_PATH_OUTSIDE_VAULT');
    const inside = validateNote(doc('<p><a href="../nota-x.html">x</a></p>'), {
      notePath: 'enlaces/enlace-01.html',
    });
    expect(inside.ok).toBe(true);
    const unbased = validateNote(
      doc('<p><a href="../nota.html">x</a></p><p><a href="/etc/passwd">y</a></p>'),
    );
    expect(codes(unbased).filter((code) => code === 'E_PATH_OUTSIDE_VAULT')).toHaveLength(1);

    const badPath = validateNote(doc('<p>Texto</p>'), { notePath: '../fuera.html' });
    expect(badPath.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_ARG_INVALID',
        message: formatDiagnostic('E_ARG_INVALID').message,
        details: { field: 'notePath' },
      }),
    );
  });

  it('rejects oversized and non-string input and survives deep nesting', () => {
    for (const input of [null, 1, undefined, {}, []]) {
      const result = validateNote(input);
      expect(result.ok).toBe(false);
      expect(result.note).toBeNull();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'input' } }),
      ]);
    }

    const over = 'a'.repeat(MAX_NOTE_HTML_CHARS + 1);
    const rejected = validateNote(over);
    expect(rejected.note).toBeNull();
    expect(rejected.diagnostics).toEqual([
      expect.objectContaining({
        code: 'E_HTML_INVALID',
        details: { reason: 'size', length: MAX_NOTE_HTML_CHARS + 1 },
      }),
    ]);

    const globalRecord = globalThis as Record<string, unknown>;
    const marker = '__gaveta_validate_deep';
    globalRecord[marker] = false;
    const depth = Math.max(2000, MAX_NOTE_DEPTH + 50);
    const body = [
      '<article>',
      '<section id="intro"><h2>Intro</h2><p>Safe</p></section>',
      '<div>'.repeat(depth),
      `<script>globalThis['${marker}']=true; SECRET_PAYLOAD</script>`,
      `<img src="x.png" alt="" onerror="globalThis['${marker}']=true">`,
      '</div>'.repeat(depth),
      '</article>',
    ].join('');
    let result: ValidationResult | undefined;
    expect(() => {
      result = validateNote(document(body, { title: 'Deep' }), { notePath: 'nota.html' });
    }).not.toThrow();
    if (result === undefined) {
      throw new Error('validator returned nothing');
    }
    expect(globalRecord[marker]).toBe(false);
    expect(result.ok).toBe(false);
    expect(requireNote(result).plainText).toContain('Safe');
    expect(requireNote(result).plainText).not.toContain('SECRET_PAYLOAD');
    expect(result.diagnostics[0]?.code).toBe('E_HTML_INVALID');
    expect(result.diagnostics[0]?.details?.reason).toBe('depth');
    expect(codes(result)).toContain('E_UNSAFE_SCRIPT');
    expect(codes(result)).toContain('E_UNSAFE_HANDLER');
    expect(codes(result)).toContain('E_HTML_INVALID');
    Reflect.deleteProperty(globalRecord, marker);
  });

  it('passes parser metadata diagnostics through', () => {
    const missing = validateNote(document('<article><h1>T</h1></article>', { id: null }));
    expect(missing.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_META_MISSING',
        message: formatDiagnostic('E_META_MISSING').message,
        details: { field: 'gaveta:id' },
      }),
    );
    const badTarget = validateNote(doc('<p><a href="otra.html" data-g-to="not-a-ulid">x</a></p>'), {
      notePath: 'nota.html',
    });
    expect(badTarget.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'E_HTML_INVALID', details: { reason: 'target-id' } }),
    );
  });
});

describe('validateVault', () => {
  function valid(id: string, href = 'otra.html'): string {
    return document(
      `<article><h1>Título</h1><section id="resumen"><h2>Resumen</h2><p><a href="${href}">x</a></p></section></article>`,
      { id },
    );
  }

  it('sorts files and reports duplicate ids without flagging a single copy', () => {
    const alone = validateNote(valid(NOTE_ID), { notePath: 'a.html' });
    expect(alone.ok).toBe(true);

    const empty = validateVault([]);
    expect(empty.ok).toBe(true);
    expect(empty.files).toEqual([]);

    const vault = validateVault([
      { path: 'b.html', html: valid(NOTE_ID) },
      { path: 'a.html', html: valid(NOTE_ID, 'b.html') },
      { path: 'c.html', html: valid(OTHER_ID) },
    ]);
    expect(vault.files.map((file) => file.path)).toEqual(['a.html', 'b.html', 'c.html']);
    expect(vault.ok).toBe(false);
    const duplicates = vault.files.filter((file) =>
      file.result.diagnostics.some((diagnostic) => diagnostic.code === 'E_ID_DUPLICATE'),
    );
    expect(duplicates.map((file) => file.path)).toEqual(['a.html', 'b.html']);
    expect(duplicates[0]?.result.ok).toBe(false);
    expect(duplicates[0]?.result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'E_ID_DUPLICATE',
        severity: 'error',
        message: formatDiagnostic('E_ID_DUPLICATE').message,
        hint: formatDiagnostic('E_ID_DUPLICATE').hint,
        details: { id: NOTE_ID, path: 'a.html', other: 'b.html' },
      }),
    );
    expect(duplicates[0]?.result.note?.diagnostics).toBe(duplicates[0]?.result.diagnostics);
    expect(vault.files[2]?.result.ok).toBe(true);
    expect(vault.files[2]?.result.diagnostics).toEqual([]);
  });

  it('uses each file path when judging relative links', () => {
    const nestedHtml = doc('<p><a href="../nota.html">x</a></p>', { id: NOTE_ID });
    const rootHtml = doc('<p><a href="../nota.html">x</a></p>', { id: OTHER_ID });
    const vault = validateVault([
      { path: 'docs/a.html', html: nestedHtml },
      { path: 'a.html', html: rootHtml },
    ]);
    const nested = vault.files.find((file) => file.path === 'docs/a.html');
    const root = vault.files.find((file) => file.path === 'a.html');
    expect(nested?.result.ok).toBe(true);
    expect(codes(root?.result ?? { ok: false, note: null, diagnostics: [] })).toContain(
      'E_PATH_OUTSIDE_VAULT',
    );
  });
});
