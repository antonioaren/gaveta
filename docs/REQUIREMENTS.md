# Gaveta — Requisitos v1

Este documento traduce el [PRD](PRD.md) en requisitos verificables. Cada requisito tiene un id estable (`REQ-…`) que se usa en [TASKS.md](TASKS.md) y en los tests.

- **Prioridad:** P0 (imprescindible para v1), P1 (siguiente iteración), P2 (fuera de v1, solo condiciona el diseño).
- **Criterio de aceptación:** cada requisito P0 tiene al menos uno, escrito para poder convertirse en un test automático.
- **Fase:** la fase del roadmap en la que se entrega (ver [TASKS.md](TASKS.md)).

## Índice

1. [Decisiones propuestas a las preguntas abiertas](#decisiones-propuestas-a-las-preguntas-abiertas)
2. [Glosario](#glosario)
3. [Requisitos funcionales](#requisitos-funcionales)
4. [Contrato de autoría](#contrato-de-autoría)
5. [Contrato de la CLI](#contrato-de-la-cli)
6. [Requisitos no funcionales](#requisitos-no-funcionales)
7. [Matriz de trazabilidad](#matriz-de-trazabilidad)

## Decisiones propuestas a las preguntas abiertas

El PRD deja seis preguntas abiertas, dos de ellas bloqueantes para la fase 1. Estas son las propuestas que asume el resto del documento. Mientras no se aprueben, cada una está en estado **Propuesta**.

| Id | Pregunta | Propuesta | Motivo | Estado |
| --- | --- | --- | --- | --- |
| DEC-01 | ¿CLI en Go o en TypeScript? | **TypeScript** (Node ≥ 20) en un monorepo. El núcleo (`@gaveta/core`) se comparte entre la CLI, el servidor y la app. | Un único validador y un único resolutor de enlaces garantizan que la CLI y la app acepten exactamente el mismo HTML (principio 3). El binario único se puede generar más adelante con `bun build --compile` o con Node SEA. | Propuesta |
| DEC-02 | Base del editor visual | **TipTap (ProseMirror)** para el modo visual, con un esquema que mapea 1:1 los elementos del contrato. Cualquier nodo desconocido se convierte en un nodo atómico `htmlBlock`. **CodeMirror 6** para el modo código. | ProseMirror permite un esquema cerrado (no degrada lo que no entiende) y serializar de vuelta a HTML de forma determinista. | Propuesta (bloquea la fase 3) |
| DEC-03 | ¿Vocabulario de `rel` cerrado o abierto? | **Abierto por vault**, con el vocabulario sugerido como valor por defecto en `.gaveta/config.json`. Un `rel` fuera de la lista produce un aviso (`W_REL_UNKNOWN`), no un error. Con `"rel": { "strict": true }` pasa a ser un error. | Permite evolucionar sin romper notas y mantiene los filtros del grafo predecibles. | Propuesta |
| DEC-04 | ¿HTML completo o solo `<article>` + metadatos? | **Archivo HTML completo**, con formateo canónico al guardar. | Es lo que exige el principio 1 y el criterio "una nota abierta en el navegador se ve con el tema". El ruido en los diffs se mitiga con el formateo canónico (REQ-FMT-01). | Propuesta (bloquea la fase 1) |
| DEC-05 | ¿Imágenes remotas permitidas o descargadas? | **Bloqueadas por defecto.** `gaveta new/edit --fetch-assets` las descarga a `attachments/` y reescribe el `src`. Se pueden permitir dominios concretos en `config.json` (`"remoteAllowlist": []`). | Es coherente con "seguro por defecto" y evita filtrar datos al abrir la nota. | Propuesta |
| DEC-06 | ¿Alias corto `gv`? | **Sí.** `gv` es un alias del mismo binario que `gaveta`. | Reduce tokens y escritura sin coste. | Propuesta |

## Glosario

| Término | Definición |
| --- | --- |
| Vault | Carpeta raíz que contiene las notas `.html` y la carpeta `.gaveta/`. |
| Nota | Archivo `.html` completo que cumple el contrato de autoría y tiene un `gaveta:id`. |
| `ref` | Referencia a una nota: id (ULID), ruta relativa al vault o título/alias. |
| Enlace canónico | `<a>` con `href` relativo y `data-g-to` con el id del destino. |
| Enlace pendiente | Enlace a un título que todavía no existe como nota. Se guarda como `<a data-g-pending="Título">` y aparece en el grafo como nodo fantasma. |
| Enlace roto | Enlace cuyo `data-g-to` apunta a un id que no existe en el vault. |
| Nota huérfana | Nota sin enlaces entrantes ni salientes. |
| Índice | Caché SQLite en `.gaveta/index.sqlite`. Se puede reconstruir siempre a partir de los archivos. |
| Contrato | Conjunto de elementos, atributos y componentes HTML permitidos (sección [Contrato de autoría](#contrato-de-autoría)). |

## Requisitos funcionales

### Vault y formato de nota

| Id | Prioridad | Fase | Requisito | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| REQ-VAULT-01 | P0 | 1 | `gaveta init [dir]` crea la carpeta `.gaveta/` con `config.json`, `theme.css` e `index.sqlite`. No toca ningún archivo existente. | Ejecutar `init` dos veces es idempotente. En un directorio con `.html` previos, esos archivos quedan intactos. |
| REQ-VAULT-02 | P0 | 1 | `gaveta init --agent-instructions [claude\|agents]` añade o actualiza un bloque delimitado con instrucciones para el agente en `CLAUDE.md` o `AGENTS.md`. | Ejecutarlo dos veces no duplica el bloque (está delimitado por `<!-- gaveta:start -->` y `<!-- gaveta:end -->`). |
| REQ-VAULT-03 | P0 | 1 | Cada nota es un HTML completo con `<title>`, `gaveta:id` (ULID), `gaveta:type`, `gaveta:created` y, opcionalmente, `gaveta:tags`, `gaveta:aliases` y `gaveta:updated`. | `gaveta validate` falla con `E_META_MISSING` si falta un metadato obligatorio. |
| REQ-VAULT-04 | P0 | 1 | La CLI inserta `<link rel="stylesheet">` al tema con la ruta relativa correcta según la profundidad de la nota, y la recalcula al mover la nota. | Una nota en `a/b/c.html` enlaza `../../.gaveta/theme.css`. Tras `gaveta mv` a la raíz, enlaza `.gaveta/theme.css`. |
| REQ-VAULT-05 | P0 | 1 | Abierta directamente en un navegador (`file://`), una nota se ve con el tema y sus enlaces navegan. | Test E2E: Playwright abre la nota con `file://`, comprueba que el estilo del tema se aplica y hace clic en un enlace que abre la nota destino. |
| REQ-VAULT-06 | P0 | 1 | `gaveta reindex` reconstruye el índice desde los archivos. Borrar `.gaveta/` (salvo `config.json` y `theme.css`, que se regeneran con valores por defecto) no pierde contenido. | Tras borrar `index.sqlite`, `gaveta graph --json` devuelve el mismo grafo que antes, comparado tras ordenar nodos y aristas. |
| REQ-VAULT-07 | P0 | 1 | El id es la identidad: si dos archivos tienen el mismo `gaveta:id`, el índice lo reporta como `E_ID_DUPLICATE` y no lo resuelve en silencio. | `gaveta doctor` lista ambos archivos. |
| REQ-VAULT-08 | P0 | 1 | Un archivo `.html` sin `gaveta:id` añadido por un editor externo se puede adoptar con `gaveta adopt <ruta>`, que añade los metadatos que faltan. | Tras `adopt`, la nota pasa `validate` y aparece en el índice. |

### Enlaces y conexiones

| Id | Prioridad | Fase | Requisito | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| REQ-LINK-01 | P0 | 1 | Al guardar (CLI o app), `[[Título]]`, `[[Título\|texto]]` y `[[Título#sección]]` se convierten en enlaces canónicos resolviendo por título y alias, sin distinguir mayúsculas ni acentos. | Dado `[[roadmap]]` y una nota con título "Roadmap", el archivo guardado contiene `<a href="…/roadmap.html" data-g-to="<id>">Roadmap</a>`. |
| REQ-LINK-02 | P0 | 1 | Si `[[…]]` no resuelve, se guarda como enlace pendiente (`<a data-g-pending="Título">`). La salida de la CLI lo informa como aviso `W_LINK_PENDING` con sugerencias por similitud. | `gaveta doctor --json` lista el pendiente. Al crear después una nota con ese título, el pendiente pasa a canónico de forma automática. |
| REQ-LINK-03 | P0 | 1 | Si un título es ambiguo (varias notas coinciden), la escritura falla con `E_REF_AMBIGUOUS` y devuelve los candidatos. | La salida JSON incluye `candidates[]` con id, título y ruta. |
| REQ-LINK-04 | P0 | 1 | Si `href` y `data-g-to` no coinciden, manda `data-g-to` y Gaveta repara el `href` al reindexar o al guardar. | Editar a mano un `href` erróneo y ejecutar `gaveta doctor --fix` deja el `href` correcto. |
| REQ-LINK-05 | P0 | 1 | `rel` es opcional y sigue la política de DEC-03. | Un `rel` desconocido produce `W_REL_UNKNOWN`, o un error si `strict` está activado. |
| REQ-LINK-06 | P0 | 1 | `gaveta links <ref>` devuelve los enlaces salientes (destino, `rel`, texto, sección de origen). | Salida JSON estable y verificada con un snapshot. |
| REQ-LINK-07 | P0 | 1 | `gaveta backlinks <ref>` devuelve los enlaces entrantes con la frase donde aparece cada enlace (contexto de hasta 200 caracteres). | Cada elemento incluye `context` con el texto que rodea al enlace. |
| REQ-LINK-08 | P0 | 1 | `gaveta link <origen> <destino> [--rel] [--text] [--section]` añade un enlace canónico sin editar el HTML a mano. Por defecto lo añade en una sección "Relacionado" al final del `<article>`. | Ejecutarlo dos veces con los mismos argumentos no duplica el enlace. |
| REQ-LINK-09 | P0 | 1 | `gaveta mv <ref> <destino>` mueve o renombra la nota y reescribe el `href` de todas las notas que la enlazan, todo en una sola operación. | Dadas 20 notas que enlazan a X, tras `mv` los 20 `href` están actualizados y `doctor` reporta 0 rotos. Si una escritura falla, se revierten todas. |
| REQ-LINK-10 | P0 | 1 | `gaveta rm <ref>` falla con `E_HAS_BACKLINKS` si la nota tiene backlinks, salvo con `--force`. Con `--force`, los enlaces entrantes pasan a pendientes, no a rotos. | La salida de error incluye `affected[]`. Tras `--force`, `doctor` reporta pendientes, no rotos. |
| REQ-LINK-11 | P0 | 1 | `gaveta doctor` reporta enlaces rotos, pendientes, notas huérfanas, ids duplicados y notas que no pasan validación. `--fix` repara lo que se puede reparar de forma determinista (`href` desfasados y ruta del tema). | Un vault de prueba con cada tipo de problema produce exactamente un hallazgo de cada tipo. |
| REQ-LINK-12 | P1 | 4 | `gaveta mentions <ref>` lista menciones no enlazadas (el título o un alias aparece como texto) y `--link` las convierte en enlaces. | — |
| REQ-LINK-13 | P1 | 4 | `<gaveta-embed data-g-to="<id>" data-g-section="<id>">` transcluye una sección de otra nota en la app. Fuera de la app se ve como un enlace. | — |

### Grafo

| Id | Prioridad | Fase | Requisito | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| REQ-GRAPH-01 | P0 | 1 | `gaveta graph --json` devuelve el grafo global: nodos (id, título, tipo, tags, ruta, `ghost`) y aristas (origen, destino, `rel`). | Los enlaces pendientes aparecen como nodos con `ghost: true`. |
| REQ-GRAPH-02 | P0 | 1 | `gaveta graph <ref> --depth N` (N de 1 a 3) devuelve el grafo local. | Con N = 1 solo aparecen vecinos directos. N fuera de rango produce `E_ARG_INVALID`. |
| REQ-GRAPH-03 | P0 | 1 | Filtros `--type`, `--tag` y `--rel` combinables. | Con `--rel depends-on`, todas las aristas devueltas tienen ese `rel`. |
| REQ-GRAPH-04 | P0 | 2 | La app muestra un grafo global y otro local con los mismos filtros, nodos fantasma diferenciados y, opcionalmente, tags como nodos. | Hacer clic en un nodo abre la nota. Los nodos fantasma ofrecen "Crear nota". |

### Tipos de nota y componentes

| Id | Prioridad | Fase | Requisito | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| REQ-TYPE-01 | P0 | 1 | Tipo `doc`: `<article>` con `h1`–`h3` y secciones con `id` estable. La CLI genera los `id` que falten (slug del encabezado, único en la nota). | `gaveta read --as outline` devuelve el árbol de secciones con sus ids. |
| REQ-TYPE-02 | P0 | 1 | Tipo `slides`: un `<section class="slide">` por diapositiva y notas del ponente en `<aside class="notes">`. | `validate` falla si una nota `slides` no tiene ninguna `section.slide`. |
| REQ-TYPE-03 | P0 | 1 | Tipo `todo`: `<ul class="tasks">` con `<li data-g-task id="…">` e `<input type="checkbox">`. `data-g-due` (ISO 8601) y `data-g-priority` (`low\|medium\|high`) son opcionales. | `validate` falla con `E_TASK_INVALID` si `data-g-due` no es una fecha válida. |
| REQ-TYPE-04 | P0 | 1 | `gaveta todo add\|check\|uncheck\|list` gestiona tareas de cualquier nota, también las que están dentro de un `doc`. | `check` añade el atributo `checked` al checkbox y solo cambia esa línea en el diff. |
| REQ-TYPE-05 | P0 | 1 | Componentes P0: callout (`<aside class="callout" data-kind="info\|warn">`), tabla, figura con imagen (`<figure><img><figcaption>`) y bloque de código (`<pre><code class="language-x">`). | Cada componente tiene un ejemplo en `gaveta guide` que pasa `validate`. |
| REQ-TYPE-06 | P1 | 4 | Diagramas con `<pre class="mermaid">` renderizados por la app. | — |
| REQ-TYPE-07 | P1 | 4 | Plantillas por tipo de nota en `.gaveta/templates/`. | — |

### CLI para agentes

| Id | Prioridad | Fase | Requisito | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| REQ-CLI-01 | P0 | 1 | Todos los comandos aceptan `--json`. La salida JSON sigue el sobre versionado de [Contrato de la CLI](#contrato-de-la-cli). | Hay un test de snapshot por comando. Cambiar la forma de la salida obliga a subir `schemaVersion`. |
| REQ-CLI-02 | P0 | 1 | El contenido se puede pasar por argumento, por archivo (`--from ruta`) o por stdin (`--from -`). | Un HTML de 1 MB por stdin se guarda sin pérdida. |
| REQ-CLI-03 | P0 | 1 | Los errores incluyen `code`, `message` y `hint`. Los códigos son estables y están documentados en `gaveta guide --errors`. | Cada código del catálogo tiene un test que lo provoca. |
| REQ-CLI-04 | P0 | 1 | `gaveta new <título> --type doc\|slides\|todo [--in carpeta] [--tags a,b] [--aliases] --from -` crea la nota, completa los metadatos, normaliza el HTML, resuelve `[[…]]` y valida. Acepta tanto un `<article>` suelto como un documento completo. | Devuelve id, ruta, hash, avisos y enlaces resueltos y pendientes. |
| REQ-CLI-05 | P0 | 1 | `gaveta read <ref> [--as html\|text\|outline]`. `outline` incluye ids de sección, tareas y enlaces. `text` es texto plano para leer con pocos tokens. | `read` siempre devuelve el `hash` actual de la nota. |
| REQ-CLI-06 | P0 | 1 | `gaveta edit <ref> --section <id> --replace\|--append\|--prepend --from -` hace ediciones parciales. Sin `--section`, `--replace` sustituye el `<article>` entero. | Solo cambia la sección indicada; el resto del archivo queda igual byte a byte. |
| REQ-CLI-07 | P0 | 1 | `--if-match <hash>` en cualquier comando de escritura rechaza la escritura con `E_CONFLICT` si el hash actual no coincide. | Test: leer, modificar el archivo por fuera, escribir con el hash antiguo y obtener `E_CONFLICT`. |
| REQ-CLI-08 | P0 | 1 | `<ref>` acepta id, ruta o título/alias, en ese orden de prioridad. | Un título ambiguo produce `E_REF_AMBIGUOUS`; uno inexistente, `E_REF_NOT_FOUND` con sugerencias. |
| REQ-CLI-09 | P0 | 1 | `gaveta guide` imprime el contrato de autoría completo: elementos, componentes, tipos, convenciones de enlace, todos los comandos con un ejemplo y el catálogo de errores. Admite `--json` y `--topic <x>`. | Un test comprueba que cada comando registrado en la CLI aparece en `guide` con un ejemplo. |
| REQ-CLI-10 | P0 | 1 | `gaveta search <consulta> [--type] [--tag] [--limit]` hace búsqueda de texto completo (SQLite FTS5) sobre título, alias, encabezados y cuerpo, con un fragmento resaltado en cada resultado. | Encontrar "sqlite" en una nota cuyo cuerpo lo menciona devuelve esa nota la primera. |
| REQ-CLI-11 | P0 | 1 | `gaveta validate [<ref>]` valida una nota o el vault entero contra el contrato. El código de salida es distinto de cero si hay errores. | Ver REQ-SEC-02. |
| REQ-CLI-12 | P0 | 2 | `gaveta serve [--port] [--open]` arranca la API local y la app web. | Escucha solo en `127.0.0.1`. |
| REQ-CLI-13 | P0 | 1 | Cada escritura de la CLI es atómica (escribe en un archivo temporal y lo renombra) y deja el archivo con formato canónico. | Matar el proceso a mitad de una escritura nunca deja un archivo truncado. |
| REQ-CLI-14 | P1 | 4 | `gaveta mcp` expone los mismos comandos como servidor MCP por stdio (`new`, `read`, `edit`, `search`, `links`, `backlinks`, `link`, `graph`, `todo`, `validate`, `guide`). | — |
| REQ-CLI-15 | P1 | 4 | `gaveta stats` calcula las métricas del PRD a partir del índice y de un log de comandos local opcional (`.gaveta/log.jsonl`). No envía telemetría. | — |

### Visor y editor (app)

| Id | Prioridad | Fase | Requisito | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| REQ-APP-01 | P0 | 2 | Diseño de tres columnas: explorador (carpetas, tags, tipos), nota y panel de conexiones (salientes, backlinks con contexto y grafo local). | — |
| REQ-APP-02 | P0 | 2 | Cada nota se renderiza en un `<iframe sandbox>` con CSP (ver REQ-SEC-01), con el tema del vault inyectado. | — |
| REQ-APP-03 | P0 | 2 | Los clics en enlaces dentro de la nota navegan dentro de la app (por `postMessage` desde un script propio de la app, no de la nota). Hay historial atrás y adelante, y pestañas. | — |
| REQ-APP-04 | P0 | 2 | Paleta de comandos y búsqueda global con Cmd/Ctrl+K. | — |
| REQ-APP-05 | P0 | 2 | Cambios en vivo: lo que escribe la CLI o un editor externo aparece en la app en menos de 500 ms (p95). | Ver REQ-NFR-01. |
| REQ-APP-06 | P0 | 2 | Vista `doc` con índice lateral, vista `slides` con miniaturas y modo presentación a pantalla completa con navegación por teclado, y vista `todo` con filtros por estado. | — |
| REQ-APP-07 | P0 | 2 | Panel de salud con la salida de `doctor`. Cuando un archivo editado fuera de Gaveta tiene enlaces rotos o HTML no válido, la app muestra un aviso. | — |
| REQ-APP-08 | P0 | 3 | Marcar una tarea en la app persiste `checked` en el archivo, a través del núcleo. | Tras hacer clic, el archivo contiene `checked` y `validate` pasa. |
| REQ-APP-09 | P0 | 3 | Modo de edición visual restringido a los elementos del contrato (DEC-02). | Abrir y guardar sin cambios una nota que pasa el contrato produce un archivo idéntico. |
| REQ-APP-10 | P0 | 3 | Lo que el editor visual no entiende se muestra como "bloque HTML", que solo se edita en modo código. | Una nota con un bloque desconocido conserva ese bloque byte a byte tras editar otra sección en modo visual. |
| REQ-APP-11 | P0 | 3 | Modo código (CodeMirror) con validación en vivo contra el contrato. | Los errores se muestran en línea con su código. |
| REQ-APP-12 | P0 | 3 | Autocompletado difuso de `[[` por títulos y alias, en los dos modos. | — |
| REQ-APP-13 | P0 | 3 | Si la nota cambia fuera mientras la persona la edita, se avisa y se muestra un diff en lugar de sobrescribir. | La escritura desde la app usa `--if-match`. |
| REQ-APP-14 | P0 | 3 | Renombrar, arrastrar y borrar en la app usan los mismos flujos que `mv` y `rm`, incluido el diálogo que lista los backlinks. | — |
| REQ-APP-15 | P1 | 4 | Vista agregada "Tareas" con filtros por fecha y prioridad, enlazando a la nota de origen. | — |
| REQ-APP-16 | P1 | 4 | Exportar presentaciones a PDF. | — |

### Seguridad

| Id | Prioridad | Fase | Requisito | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| REQ-SEC-01 | P0 | 2 | El iframe de la nota usa `sandbox` sin `allow-scripts` ni `allow-same-origin`, y la respuesta HTTP lleva una CSP `default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'`. | Test E2E: una nota con `<script>`, `onerror=` o `<img src="https://…">` no ejecuta nada ni hace peticiones remotas. |
| REQ-SEC-02 | P0 | 1 | `validate` marca como error `<script>`, atributos `on*`, URLs `javascript:`, `<iframe>`, `<object>`, `<embed>`, `<form>` y `<base>`. | Cada caso tiene un test con su código (`E_UNSAFE_*`). |
| REQ-SEC-03 | P0 | 1 | La CLI sanea al guardar: elimina lo inseguro, lo informa como aviso y nunca escribe un archivo que no pasa REQ-SEC-02. | — |
| REQ-SEC-04 | P0 | 1 | Recursos remotos bloqueados por defecto (DEC-05). | `validate` avisa con `W_REMOTE_RESOURCE`. |
| REQ-SEC-05 | P0 | 1 | Ninguna operación lee ni escribe fuera de la raíz del vault (protección contra path traversal y enlaces simbólicos). | `gaveta new --in ../fuera` falla con `E_PATH_OUTSIDE_VAULT`. |
| REQ-SEC-06 | P0 | 2 | El servidor escucha solo en `127.0.0.1`, exige un token por sesión en las rutas de escritura y valida la cabecera `Origin`. | Una petición de escritura sin token devuelve 401. |

### Formato y normalización

| Id | Prioridad | Fase | Requisito | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| REQ-FMT-01 | P0 | 1 | Formateo canónico al guardar: orden fijo de metadatos, indentación de 2 espacios, atributos en orden estable y un salto de línea final. | Formatear dos veces produce el mismo resultado (idempotencia). |
| REQ-FMT-02 | P0 | 1 | El normalizador elimina estilos inline y clases fuera del contrato (con aviso) y conserva el contenido. | `W_INLINE_STYLE_REMOVED` informa cuántos estilos inline se han eliminado. |

## Contrato de autoría

Es lo que imprime `gaveta guide`. La fuente de verdad será un módulo del núcleo (`contract.ts`) del que salen a la vez el validador, el esquema del editor y la guía.

**Elementos permitidos dentro de `<body>`:**

- Estructura: `article`, `section`, `header`, `footer`, `aside`, `nav`.
- Encabezados: `h1`–`h3` (en `doc`), `h4`–`h6` con aviso.
- Texto: `p`, `blockquote`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `hr`, `br`, `strong`, `em`, `code`, `kbd`, `mark`, `sub`, `sup`, `small`, `abbr`, `time`, `span` (solo con clases del contrato).
- Enlaces: `a` (canónico, pendiente o externo con `rel="noopener"`).
- Datos: `table`, `thead`, `tbody`, `tr`, `th`, `td`, `caption`.
- Medios: `figure`, `img`, `figcaption`, `picture`, `source`.
- Código: `pre`, `code`.
- Tareas: `input[type=checkbox]` solo dentro de `li[data-g-task]`.
- Componentes propios: `aside.callout`, `section.slide`, `aside.notes`, `ul.tasks`; en P1, `pre.mermaid` y `gaveta-embed`.

**Atributos permitidos:** `id`, `class` (solo clases del contrato), `href`, `src`, `alt`, `title`, `lang`, `datetime`, `colspan`, `rowspan`, `checked`, `type`, `rel`, `data-g-*`, `data-kind`.

## Contrato de la CLI

**Sobre de salida `--json`** (en stdout, un único objeto JSON por invocación):

```json
{
  "ok": true,
  "schemaVersion": 1,
  "command": "new",
  "data": { "id": "01JB…", "path": "decisiones/usar-sqlite.html", "hash": "sha256:…" },
  "warnings": [{ "code": "W_LINK_PENDING", "message": "…", "hint": "…" }]
}
```

```json
{
  "ok": false,
  "schemaVersion": 1,
  "command": "new",
  "error": {
    "code": "E_LINK_UNRESOLVED",
    "message": "No existe 'Roadmap'.",
    "hint": "¿Quisiste decir 'Gaveta roadmap'?",
    "details": { "candidates": [] }
  }
}
```

**Códigos de salida:** `0` correcto, `1` error de uso o argumentos, `2` error de validación, `3` conflicto (`E_CONFLICT`), `4` no encontrado o ambiguo, `5` error interno.

**Catálogo inicial de errores y avisos** (ampliable; un código no se renombra ni se reutiliza nunca):

| Código | Cuándo |
| --- | --- |
| `E_ARG_INVALID` | Argumento ausente o fuera de rango |
| `E_VAULT_NOT_FOUND` | No hay `.gaveta/` en el directorio actual ni en sus padres, ni en `--vault` o `GAVETA_VAULT` |
| `E_REF_NOT_FOUND` | El `ref` no corresponde a ninguna nota |
| `E_REF_AMBIGUOUS` | El título o alias coincide con varias notas |
| `E_LINK_UNRESOLVED` | Enlace que no se puede resolver en un contexto que no admite pendientes (`gaveta link`) |
| `E_META_MISSING` | Falta un metadato obligatorio |
| `E_ID_DUPLICATE` | Dos archivos comparten `gaveta:id` |
| `E_HTML_INVALID` | HTML no parseable o elemento fuera del contrato |
| `E_TYPE_STRUCTURE` | La estructura no corresponde al tipo de nota |
| `E_TASK_INVALID` | Tarea con atributos incorrectos |
| `E_UNSAFE_SCRIPT`, `E_UNSAFE_HANDLER`, `E_UNSAFE_URL`, `E_UNSAFE_ELEMENT` | Contenido inseguro |
| `E_PATH_OUTSIDE_VAULT` | La ruta sale del vault |
| `E_PATH_EXISTS` | El destino de `new` o `mv` ya existe |
| `E_HAS_BACKLINKS` | `rm` sin `--force` de una nota con backlinks |
| `E_CONFLICT` | `--if-match` no coincide |
| `W_LINK_PENDING` | Enlace pendiente creado |
| `W_REL_UNKNOWN` | `rel` fuera del vocabulario |
| `W_REMOTE_RESOURCE` | Recurso remoto bloqueado |
| `W_INLINE_STYLE_REMOVED` | Estilos inline eliminados por el normalizador |
| `W_UNSAFE_REMOVED` | Contenido inseguro eliminado al guardar |

**Localización del vault:** `--vault <dir>`, después la variable de entorno `GAVETA_VAULT` y, por último, una búsqueda ascendente de `.gaveta/` desde el directorio actual.

## Requisitos no funcionales

| Id | Categoría | Requisito |
| --- | --- | --- |
| REQ-NFR-01 | Latencia | Desde que la CLI escribe hasta que el cambio es visible en la app: p95 < 500 ms en un vault de 1000 notas. |
| REQ-NFR-02 | Rendimiento CLI | Comandos de lectura (`read`, `links`, `backlinks`, `search`) < 300 ms en un vault de 1000 notas con índice caliente. |
| REQ-NFR-03 | Reindexado | `gaveta reindex` de 5000 notas < 15 s. El watcher reindexa de forma incremental, solo el archivo cambiado. |
| REQ-NFR-04 | Determinismo | La misma entrada produce el mismo archivo y la misma salida JSON (salvo ids y fechas nuevas). Las listas siempre se devuelven ordenadas. |
| REQ-NFR-05 | Portabilidad | macOS, Linux y Windows. Rutas guardadas siempre con `/`. Archivos en UTF-8 con LF. |
| REQ-NFR-06 | Offline y privacidad | Todo funciona sin red y no hay telemetría. |
| REQ-NFR-07 | Robustez | Un archivo corrupto o no parseable no rompe el índice: se reporta y el resto del vault sigue disponible. |
| REQ-NFR-08 | Compatibilidad git | Las escrituras parciales solo cambian las líneas afectadas (formateo canónico estable). |
| REQ-NFR-09 | Calidad | Cobertura de tests del núcleo ≥ 85 %. Hay tests E2E para cada criterio de aceptación P0. |
| REQ-NFR-10 | Accesibilidad | La app se puede usar entera con teclado y cumple WCAG 2.1 AA en contraste del tema por defecto. |

## Matriz de trazabilidad

Relación entre los requisitos P0 del PRD (numerados del 1 al 11) y los ids de este documento.

| PRD P0 | Requisitos |
| --- | --- |
| 1. Vault y formato de nota | REQ-VAULT-01 a 08, REQ-FMT-01 y 02 |
| 2. Enlaces canónicos y `[[…]]` | REQ-LINK-01 a 05, REQ-LINK-11 |
| 3. Backlinks y enlaces salientes | REQ-LINK-06 y 07, REQ-APP-01, REQ-NFR-01 |
| 4. Renombrar y mover sin romper | REQ-LINK-09, REQ-VAULT-04, REQ-APP-14 |
| 5. Borrado protegido | REQ-LINK-10, REQ-APP-14 |
| 6. Grafo global y local | REQ-GRAPH-01 a 04 |
| 7. CLI v1 con `--json` | REQ-CLI-01 a 13 |
| 8. Tres tipos de nota | REQ-TYPE-01 a 05, REQ-APP-06, REQ-APP-08 |
| 9. Editor visual y de código | REQ-APP-09 a 13 |
| 10. Render seguro | REQ-SEC-01 a 06 |
| 11. Búsqueda de texto completo | REQ-CLI-10, REQ-APP-04 |
