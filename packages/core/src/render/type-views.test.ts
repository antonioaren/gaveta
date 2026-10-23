import { expect, it } from 'vitest';
import { buildRenderTypeLayout, collectSlideThumbTargets } from './type-views.ts';

const DOC_BODY = `<article>
<nav class="toc"><a href="#uno">Uno</a></nav>
<section id="uno"><h2>Uno</h2></section>
</article>`;

const SLIDES_BODY = `<section class="slide" id="a"><h2>A</h2></section>
<section class="slide" id="b"><h2>B</h2></section>`;

const TODO_BODY = `<ul class="tasks">
<li data-g-task id="t1"><input type="checkbox" /> Abierta</li>
<li data-g-task id="t2"><input type="checkbox" checked /> Hecha</li>
</ul>`;

it('wraps doc notes with a lateral toc region', () => {
  const layout = buildRenderTypeLayout('doc', DOC_BODY);
  expect(layout.html).toContain('gaveta-render--doc');
  expect(layout.html).toContain('gaveta-render__toc');
  expect(layout.html).toContain('nav class="toc"');
  expect(layout.html).toContain('gaveta-render__main');
  expect(layout.scripts).toEqual([]);
});

it('auto-builds a toc for doc when headings have ids but no nav', () => {
  const body = `<article><h2 id="intro">Intro</h2><p>x</p><h3 id="detalle">Detalle</h3></article>`;
  const layout = buildRenderTypeLayout('doc', body);
  expect(layout.html).toContain('href="#intro"');
  expect(layout.html).toContain('href="#detalle"');
});

it('wraps slides with thumbnails and loads the slides script', () => {
  const layout = buildRenderTypeLayout('slides', SLIDES_BODY);
  expect(layout.html).toContain('gaveta-render--slides');
  expect(layout.html).toContain('gaveta-slide-thumbs');
  expect(layout.html).toContain('data-gaveta-slide-thumb="a"');
  expect(layout.html).toContain('data-gaveta-action="present"');
  expect(layout.scripts).toEqual(['render-slides.js']);
});

it('collects slide ids for thumbnails', () => {
  expect(collectSlideThumbTargets(SLIDES_BODY)).toEqual([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]);
});

it('wraps todo notes with filter toolbar and script', () => {
  const layout = buildRenderTypeLayout('todo', TODO_BODY);
  expect(layout.html).toContain('gaveta-render--todo');
  expect(layout.html).toContain('gaveta-todo-filters');
  expect(layout.html).toContain('data-filter="open"');
  expect(layout.scripts).toEqual(['render-todo.js']);
});

it('uses the doc layout for dashboard and design artifact types', () => {
  const body = '<article class="g-dashboard"><gaveta-kpi data-label="K">1</gaveta-kpi></article>';
  expect(buildRenderTypeLayout('dashboard', body).html).toContain('gaveta-render--dashboard');
  expect(buildRenderTypeLayout('design', body).html).toContain('gaveta-render--design');
  expect(buildRenderTypeLayout('artifact', body).html).toContain('gaveta-render--artifact');
});
