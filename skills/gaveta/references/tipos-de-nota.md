# Tipos de nota

Cada nota tiene `gaveta:type` en el `<head>`. Los ejemplos completos y las reglas estructurales están en `gaveta guide --topic tipos`.

Tipos disponibles: doc, slides, todo, dashboard, design, artifact.

## doc

Fragmento mínimo (sin envoltorio html/head). Abre la guía para el documento completo validable.

```html
<article>
  <h1>Título</h1>
  <section id="resumen">
    <h2>Resumen</h2>
    <p>Texto.</p>
  </section>
</article>
```

## slides

Fragmento mínimo (sin envoltorio html/head). Abre la guía para el documento completo validable.

```html
<section class="slide" id="portada">
  <h1>Portada</h1>
  <aside class="notes">
    <p>Notas del ponente.</p>
  </aside>
</section>
```

## todo

Fragmento mínimo (sin envoltorio html/head). Abre la guía para el documento completo validable.

```html
<ul class="tasks">
  <li data-g-task id="revisar-contrato" data-g-due="2026-10-22" data-g-priority="high">
    <input type="checkbox" />
    Revisar el contrato
  </li>
</ul>
```

## dashboard

Fragmento mínimo (sin envoltorio html/head). Abre la guía para el documento completo validable.

```html
<article class="g-dashboard">
  <h1>Panel</h1>
  <gaveta-kpi class="g-kpi" data-label="KPI">42</gaveta-kpi>
  <gaveta-chart type="line">
    <table>
      <tbody>
        <tr>
          <td>A</td>
          <td>1</td>
        </tr>
      </tbody>
    </table>
  </gaveta-chart>
</article>
```

## design

Fragmento mínimo (sin envoltorio html/head). Abre la guía para el documento completo validable.

```html
<section class="g-frame" data-device="desktop" id="inicio">
  <h2>Inicio</h2>
  <p>Mockup de la pantalla principal.</p>
</section>
```

## artifact

Fragmento mínimo (sin envoltorio html/head). Abre la guía para el documento completo validable.

```html
<article>
  <h1>Demo interactiva</h1>
  <section id="descripcion">
    <p>Contenido importado desde Claude.</p>
  </section>
  <iframe
    sandbox="allow-scripts"
    title="Demo"
    srcdoc='&lt;!doctype html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset="utf-8"&gt;&lt;/head&gt;&lt;body&gt;&lt;p&gt;Hola&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;'
  ></iframe>
</article>
```
