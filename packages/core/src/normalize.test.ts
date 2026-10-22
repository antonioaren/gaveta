import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTICS,
  MAX_NOTE_DEPTH,
  MAX_NOTE_HTML_CHARS,
  NOTE_TYPE_STRUCTURES,
  formatDiagnostic,
  normalizeNote,
  parseNote,
  validateNote,
  type NormalizeNoteOptions,
  type NormalizeResult,
} from './index.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const TARGET_ID = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const CREATED = '2026-10-22T10:00:00Z';

function meta(name: string, content: string): string {
  return `<meta name="${name}" content="${content}" />`;
}

function shell(
  body: string,
  options: { readonly type?: string; readonly path?: string } = {},
): string {
  const depth = (options.path ?? 'nota.html').split('/').length - 1;
  const theme = `${'../'.repeat(depth)}.gaveta/theme.css`;
  return [
    '<!doctype html>',
    '<html lang="es">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <title>Título</title>',
    `    ${meta('gaveta:id', NOTE_ID)}`,
    `    ${meta('gaveta:type', options.type ?? 'doc')}`,
    `    ${meta('gaveta:created', CREATED)}`,
    `    <link rel="stylesheet" href="${theme}" />`,
    '  </head>',
    '  <body>',
    body,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function requireHtml(result: NormalizeResult): string {
  expect(result.html).not.toBeNull();
  if (result.html === null) {
    throw new Error('expected normalized html');
  }
  return result.html;
}

function codes(result: NormalizeResult): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function expectFixedPoint(input: unknown, options: NormalizeNoteOptions = {}): string {
  const once = normalizeNote(input, options);
  const html = requireHtml(once);
  expect(html.endsWith('\n')).toBe(true);
  expect(html.includes('\r')).toBe(false);
  const twice = normalizeNote(html, options);
  expect(twice.html).toBe(html);
  expect(twice.diagnostics).toEqual([]);
  return html;
}

function expectValid(input: unknown, options: NormalizeNoteOptions = {}): string {
  const html = expectFixedPoint(input, options);
  const validated = validateNote(html, {
    ...(options.notePath === undefined ? {} : { notePath: options.notePath }),
    ...(options.remoteAllowlist === undefined ? {} : { remoteAllowlist: options.remoteAllowlist }),
  });
  expect(validated.ok).toBe(true);
  const parsed = parseNote(html);
  expect(parsed.ok).toBe(true);
  const again = parseNote(normalizeNote(html, options).html);
  expect(again.note?.plainText).toBe(parsed.note?.plainText);
  expect(again.note?.links.map((link) => link.kind)).toEqual(
    parsed.note?.links.map((link) => link.kind),
  );
  return html;
}

describe('normalizeNote canonical form', () => {
  it('orders metadata, indents with two spaces, orders attributes, and ends with a newline', () => {
    const messy = [
      '<!DOCTYPE HTML>',
      `<html lang="es"><head><meta name="gaveta:created" content="${CREATED}">`,
      `<meta charset="utf-8"><title>Título</title>`,
      `<meta content="${NOTE_ID}" name="gaveta:id">`,
      '<meta name="gaveta:type" content="doc">',
      '</head><body><article><h1>Título</h1>',
      '<section id="resumen"><h2>Resumen</h2>',
      `<p class="nope" style="color:red"><a rel="related" data-g-to="${TARGET_ID}" href="otra.html">Otra</a></p>`,
      '</section></article></body></html>',
    ].join('');
    const html = expectValid(messy, { notePath: 'nota.html' });
    expect(html).toBe(
      [
        '<!doctype html>',
        '<html lang="es">',
        '  <head>',
        '    <meta charset="utf-8" />',
        '    <title>Título</title>',
        `    <meta name="gaveta:id" content="${NOTE_ID}" />`,
        '    <meta name="gaveta:type" content="doc" />',
        `    <meta name="gaveta:created" content="${CREATED}" />`,
        '    <link rel="stylesheet" href=".gaveta/theme.css" />',
        '  </head>',
        '  <body>',
        '    <article>',
        '      <h1>Título</h1>',
        '      <section id="resumen">',
        '        <h2>Resumen</h2>',
        `        <p><a href="otra.html" data-g-to="${TARGET_ID}" rel="related">Otra</a></p>`,
        '      </section>',
        '    </article>',
        '  </body>',
        '</html>',
        '',
      ].join('\n'),
    );
    expect(codes(normalizeNote(messy, { notePath: 'nota.html' }))).toEqual([
      'W_INLINE_STYLE_REMOVED',
      'W_CLASS_REMOVED',
    ]);
    const styled = normalizeNote(messy, { notePath: 'nota.html' });
    expect(styled.diagnostics[0]).toMatchObject({
      code: 'W_INLINE_STYLE_REMOVED',
      message: formatDiagnostic('W_INLINE_STYLE_REMOVED', { count: 1 }).message,
      hint: DIAGNOSTICS.W_INLINE_STYLE_REMOVED.hint,
      details: { count: 1 },
    });
    expect(styled.diagnostics[1]).toMatchObject({
      code: 'W_CLASS_REMOVED',
      message: formatDiagnostic('W_CLASS_REMOVED', { count: 1 }).message,
      details: { count: 1 },
    });
  });

  it('is idempotent: normalize(normalize(x)) === normalize(x)', () => {
    const html = expectFixedPoint(
      shell(
        '<article><h1>Título</h1><section><h2>Resumen rápido</h2><p>Hola</p></section></article>',
      ),
      { notePath: 'notas/prd.html' },
    );
    expect(html).toContain('id="resumen-rapido"');
    expect(html).toContain('href="../.gaveta/theme.css"');
    expect(normalizeNote(normalizeNote(html, { notePath: 'notas/prd.html' }).html).html).toBe(
      normalizeNote(html, { notePath: 'notas/prd.html' }).html,
    );
  });

  it('round-trips through parseNote and keeps wikilinks, tasks, and sections', () => {
    const html = expectValid(
      shell(
        [
          '<article>',
          '<h1>Título</h1>',
          '<section id="atajos">',
          '<h2>Atajos</h2>',
          '<p>[[Destino enlace]]</p>',
          '<p>[[Destino enlace|texto visible]]</p>',
          '<p>[[Destino enlace#resumen]]</p>',
          '<ul class="tasks">',
          '<li data-g-task id="revisar" data-g-due="2026-10-22" data-g-priority="high">',
          '<input type="checkbox" checked />',
          'Revisar',
          '</li>',
          '</ul>',
          '</section>',
          '</article>',
        ].join(''),
      ),
      { notePath: 'nota.html' },
    );
    const note = parseNote(html).note;
    expect(note?.sections.map((section) => section.id)).toEqual(['atajos']);
    expect(note?.links.map((link) => link.wikilink?.raw)).toEqual([
      '[[Destino enlace]]',
      '[[Destino enlace|texto visible]]',
      '[[Destino enlace#resumen]]',
    ]);
    expect(note?.tasks[0]).toMatchObject({
      id: 'revisar',
      checked: true,
      due: '2026-10-22',
      priority: 'high',
    });
    expect(note?.plainText).toContain('Revisar');
  });

  it('accepts each contract type example and keeps it valid', () => {
    for (const type of ['doc', 'slides', 'todo'] as const) {
      const html = expectValid(shell(NOTE_TYPE_STRUCTURES[type].example, { type }), {
        notePath: 'notas/ejemplo.html',
      });
      expect(html).toContain('href="../.gaveta/theme.css"');
    }
  });
});

describe('normalizeNote repairs', () => {
  it('assigns missing section ids and disambiguates collisions with the slug rule', () => {
    const html = expectValid(
      shell(
        [
          '<article><h1>Título</h1>',
          '<section><h2>Resumen</h2><p>Uno</p></section>',
          '<section id="resumen"><h2>Resumen</h2><p>Dos</p></section>',
          '<section><h2>Resumen</h2><p>Tres</p></section>',
          '<section><p>Sin título</p></section>',
          '</article>',
        ].join(''),
      ),
      { notePath: 'nota.html' },
    );
    expect(html).toContain('id="resumen-2"');
    expect(html).toContain('id="resumen-3"');
    expect(html).toContain('id="seccion"');
    const ids = parseNote(html).note?.sections.map((section) => section.id);
    expect(ids).toEqual(['resumen-2', 'resumen', 'resumen-3', 'seccion']);
  });

  it('assigns missing task ids from the task text and adds one checkbox', () => {
    const html = expectValid(
      shell(
        [
          '<article><h1>Título</h1><ul class="tasks">',
          '<li data-g-task>Revisar el contrato</li>',
          '<li data-g-task id="hecho"><input type="checkbox" /><input type="checkbox" checked />Hecho</li>',
          '<li>Sueltas</li>',
          '</ul></article>',
        ].join(''),
        { type: 'todo' },
      ),
      { notePath: 'nota.html' },
    );
    const tasks = parseNote(html).note?.tasks ?? [];
    expect(tasks.map((task) => task.id)).toEqual(['revisar-el-contrato', 'hecho', 'sueltas']);
    expect(tasks.map((task) => task.checked)).toEqual([false, true, false]);
    expect(html.match(/<input /g)).toHaveLength(3);
  });

  it('rewrites the theme href from the note depth and again after a move', () => {
    const root = expectValid(shell('<article><h1>Título</h1><p>Hola</p></article>'), {
      notePath: 'c.html',
    });
    expect(root).toContain('href=".gaveta/theme.css"');
    const nested = expectValid(root, { notePath: 'a/b/c.html' });
    expect(nested).toContain('href="../../.gaveta/theme.css"');
    expect(nested).not.toContain('href=".gaveta/theme.css"');
    const back = expectValid(nested, { notePath: 'c.html' });
    expect(back).toContain('href=".gaveta/theme.css"');
  });

  it('inserts a theme link when the head has none', () => {
    const html = expectValid(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Título</title>${meta('gaveta:id', NOTE_ID)}${meta('gaveta:type', 'doc')}${meta('gaveta:created', CREATED)}</head><body><article><h1>Título</h1><p>Hola</p></article></body></html>`,
      { notePath: 'a/nota.html' },
    );
    expect(html).toContain('href="../.gaveta/theme.css"');
  });

  it('drops invalid task fields, duplicate ids, and anchors that are not links', () => {
    const html = expectValid(
      shell(
        [
          '<article><h1 id="misma">Título</h1>',
          '<section id="misma"><h2>Resumen</h2>',
          '<ul class="tasks"><li data-g-task id="fecha" data-g-due="not-a-date" data-g-priority="urgent"><input type="text" />Fecha</li></ul>',
          '<p><a>nada</a> <a data-g-to="not-a-ulid" href="otra.html">relativa</a></p>',
          `<p><a data-g-to="${TARGET_ID}" data-g-pending="Fantasma">ambos</a></p>`,
          '</section></article>',
        ].join(''),
      ),
      { notePath: 'nota.html' },
    );
    expect(html).not.toContain('not-a-date');
    expect(html).not.toContain('urgent');
    expect(html).not.toContain('data-g-pending');
    expect(html).toContain(`data-g-to="${TARGET_ID}"`);
    expect(html).toContain('href="#"');
    expect(html).toContain('nada');
    expect(html).not.toContain('>nada</a>');
    expect(html).toContain('href="otra.html"');
    expect(html).not.toContain('data-g-to="not-a-ulid"');
    const note = parseNote(html).note;
    expect(note?.tasks[0]).toMatchObject({ due: null, priority: null, text: 'Fecha' });
    expect(new Set(note?.headings.map((heading) => heading.text))).toEqual(
      new Set(['Título', 'Resumen']),
    );
  });

  it('keeps an external link and adds rel=noopener', () => {
    const html = expectValid(
      shell('<article><h1>Título</h1><p><a href="https://example.com">Example</a></p></article>'),
      { notePath: 'nota.html' },
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener"');
    expect(codes(normalizeNote(html, { notePath: 'nota.html' }))).not.toContain(
      'W_REMOTE_RESOURCE',
    );
  });

  it('preserves allowlisted remote images and strips the rest', () => {
    const source = shell(
      '<article><h1>Título</h1><p><img src="https://cdn.example/a.png" alt="permitida" /><img src="https://evil.example/pixel.png" alt="bloqueada" /></p></article>',
    );
    const html = expectValid(source, {
      notePath: 'nota.html',
      remoteAllowlist: ['cdn.example'],
    });
    expect(html).toContain('src="https://cdn.example/a.png"');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('bloqueada');
    const warned = normalizeNote(source, {
      notePath: 'nota.html',
      remoteAllowlist: ['cdn.example'],
    });
    expect(codes(warned)).toContain('W_REMOTE_RESOURCE');
    expect(
      warned.diagnostics.find((diagnostic) => diagnostic.code === 'W_REMOTE_RESOURCE'),
    ).toMatchObject({
      details: { element: 'img', attribute: 'src', url: 'https://evil.example/pixel.png' },
    });
  });
});

describe('normalizeNote security', () => {
  it('removes scripts, handlers, javascript URLs, and forbidden elements without executing them', () => {
    const payload = [
      '<article><h1>Título</h1><section id="caso"><h2>Caso</h2>',
      '<script>throw new Error("executed");alert(1)</script>',
      '<script src="https://evil.example/hook.js"></script>',
      '<p><img src="x.png" alt="" onerror="alert(1)" /></p>',
      '<p onclick="alert(1)">Pasa el ratón.</p>',
      '<svg onload="alert(1)"><script>alert(1)</script></svg>',
      '<p><a href="javascript:alert(1)">alerta</a></p>',
      '<p><a href="JAVASCRIPT:alert(1)">mayúsculas</a></p>',
      '<p><a href=" java\nscript:alert(1)">espacio</a></p>',
      '<iframe src="https://evil.example/frame.html"></iframe>',
      '<object data="https://evil.example/plugin.swf"></object>',
      '<embed src="https://evil.example/plugin.swf" />',
      '<form action="https://evil.example/collect"><p>Enviado</p><input type="text" name="dato" /></form>',
      '<p style="background-image: url(https://evil.example/bg.png)">fondo remoto</p>',
      '<p style="width: expression(alert(1))">expresión</p>',
      '</section></article>',
    ].join('');
    const full = `<!doctype html><html lang="es"><head><base href="https://evil.example/" /><meta http-equiv="refresh" content="0;url=https://evil.example/" />${meta('gaveta:id', NOTE_ID)}${meta('gaveta:type', 'doc')}${meta('gaveta:created', CREATED)}<title>Título</title><link rel="stylesheet" href="https://evil.example/evil.css" /></head><body>${payload}</body></html>`;
    const result = normalizeNote(full, { notePath: 'nota.html' });
    const html = expectValid(full, { notePath: 'nota.html' });
    const lower = html.toLowerCase();
    expect(lower).not.toContain('<script');
    expect(lower).not.toContain('javascript:');
    expect(lower).not.toContain('onerror');
    expect(lower).not.toContain('onclick');
    expect(lower).not.toContain('onload');
    expect(lower).not.toContain('<iframe');
    expect(lower).not.toContain('<object');
    expect(lower).not.toContain('<embed');
    expect(lower).not.toContain('<form');
    expect(lower).not.toContain('<base');
    expect(lower).not.toContain('expression');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('Pasa el ratón.');
    expect(html).toContain('alerta');
    expect(html).toContain('Enviado');
    expect(html).toContain('fondo remoto');
    expect(html).toContain('src="x.png"');
    expect(codes(result)).toEqual(
      expect.arrayContaining(['W_UNSAFE_REMOVED', 'W_REMOTE_RESOURCE', 'W_INLINE_STYLE_REMOVED']),
    );
    expect(
      result.diagnostics.find((diagnostic) => diagnostic.code === 'W_INLINE_STYLE_REMOVED'),
    ).toMatchObject({ details: { count: 2 } });
    expect(
      result.diagnostics.find((diagnostic) => diagnostic.code === 'W_UNSAFE_REMOVED'),
    ).toMatchObject({
      message: DIAGNOSTICS.W_UNSAFE_REMOVED.message,
      hint: DIAGNOSTICS.W_UNSAFE_REMOVED.hint,
    });
  });

  it('neutralizes vault escapes and keeps safe relative links', () => {
    const html = expectValid(
      shell(
        [
          '<article><h1>Título</h1><section id="caso"><h2>Caso</h2>',
          '<p><a href="../../fuera.html">fuera</a></p>',
          '<p><a href="/etc/passwd">passwd</a></p>',
          '<p><a href="..\\..\\fuera.html">windows</a></p>',
          '<p><a href="../nota-x.html">dentro</a></p>',
          '<p><img src="../../fuera.png" alt="fuera" /></p>',
          '<p><img src="attachments/ok.png" alt="local" /></p>',
          '</section></article>',
        ].join(''),
      ),
      { notePath: 'docs/nota.html' },
    );
    expect(html).not.toContain('/etc/passwd');
    expect(html).not.toContain('fuera.html');
    expect(html).not.toContain('fuera.png');
    expect(html).not.toContain('\\');
    expect(html).toContain('href="../nota-x.html"');
    expect(html).toContain('src="attachments/ok.png"');
    expect(html).toContain('>fuera<');
    expect(validateNote(html, { notePath: 'docs/nota.html' }).ok).toBe(true);
  });

  it('rejects oversized and non-string input and survives deep nesting', () => {
    expect(normalizeNote(null)).toMatchObject({
      ok: false,
      html: null,
      diagnostics: [
        expect.objectContaining({
          code: 'E_HTML_INVALID',
          details: { reason: 'input' },
        }),
      ],
    });
    expect(normalizeNote(1).ok).toBe(false);
    const over = 'a'.repeat(MAX_NOTE_HTML_CHARS + 1);
    const rejected = normalizeNote(over);
    expect(rejected.ok).toBe(false);
    expect(rejected.html).toBeNull();
    expect(rejected.diagnostics[0]).toMatchObject({
      code: 'E_HTML_INVALID',
      details: { reason: 'size', length: MAX_NOTE_HTML_CHARS + 1 },
    });
    expect(rejected.diagnostics[0]?.message).not.toContain('aaaa');

    const depth = Math.max(2000, MAX_NOTE_DEPTH + 50);
    const nested = shell(`${'<div>'.repeat(depth)}<p>Profundo</p>${'</div>'.repeat(depth)}`);
    let result: NormalizeResult | undefined;
    expect(() => {
      result = normalizeNote(nested, { notePath: 'nota.html' });
    }).not.toThrow();
    const html = requireHtml(result ?? { ok: false, html: null, diagnostics: [] });
    expect(html.toLowerCase().split('<div').length - 1).toBeLessThan(MAX_NOTE_DEPTH);
    expect(() => validateNote(html, { notePath: 'nota.html' })).not.toThrow();
    expect(() => parseNote(html)).not.toThrow();
  });

  it('rejects an unsafe note path and still returns html', () => {
    const result = normalizeNote(shell('<article><h1>Título</h1><p>Hola</p></article>'), {
      notePath: '../fuera.html',
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('E_ARG_INVALID');
    const html = requireHtml(result);
    expect(validateNote(html).ok).toBe(true);
  });
});

describe('normalizeNote fragments', () => {
  it('wraps a bare article in a document shell without inventing metadata', () => {
    const html = expectFixedPoint('<article><h1>Título</h1><p>Hola</p></article>');
    expect(html.startsWith('<!doctype html>\n')).toBe(true);
    expect(html).toContain('<article>');
    expect(html).toContain('Hola');
    expect(html).toContain('href=".gaveta/theme.css"');
    expect(validateNote(html).ok).toBe(false);
    expect(
      validateNote(html).diagnostics.some((diagnostic) => diagnostic.code === 'E_META_MISSING'),
    ).toBe(true);
  });

  it('strips one leading BOM and preserves a note that was already canonical', () => {
    const canonical = shell(
      '<article><h1>Título</h1><section id="resumen"><h2>Resumen</h2><p>Hola</p></section></article>',
    );
    expect(normalizeNote(canonical, { notePath: 'nota.html' }).html).toBe(canonical);
    expect(normalizeNote(`\uFEFF${canonical}`, { notePath: 'nota.html' }).html).toBe(canonical);
    expect(normalizeNote(canonical, { notePath: 'nota.html' }).diagnostics).toEqual([]);
  });
});
