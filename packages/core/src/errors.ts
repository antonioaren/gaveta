/**
 * Stable diagnostic codes. A code is never renamed or reused.
 * `message` and `hint` are the Spanish text the CLI shows.
 */

export const EXIT_CODES = {
  ok: 0,
  usage: 1,
  validation: 2,
  conflict: 3,
  notFound: 4,
  internal: 5,
} as const;

export interface DiagnosticSpec {
  readonly severity: 'error' | 'warning';
  readonly exitCode: 1 | 2 | 3 | 4 | 5 | null;
  readonly escalatesToError: boolean;
  readonly message: string;
  readonly hint: string;
}

export const DIAGNOSTICS = {
  E_ARG_INVALID: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
    message: 'El argumento falta o está fuera de rango.',
    hint: 'Consulta gaveta guide para ver los valores que admite el comando.',
  },
  E_VAULT_NOT_FOUND: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
    message: 'No se ha encontrado un vault.',
    hint: 'Indica --vault, define GAVETA_VAULT o sitúate en un directorio que contenga .gaveta/.',
  },
  E_REF_NOT_FOUND: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
    message: 'No hay ninguna nota que coincida con esa referencia.',
    hint: 'Comprueba el id, la ruta o el título, o busca con gaveta search.',
  },
  E_REF_AMBIGUOUS: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
    message: 'El título o el alias coincide con varias notas.',
    hint: 'Usa el id o la ruta. Los candidatos están en details.candidates.',
  },
  E_LINK_UNRESOLVED: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
    message: "No existe '{title}'.",
    hint: "¿Quisiste decir '{suggestion}'?",
  },
  E_LINK_BROKEN: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'El enlace apunta a un id que no existe en el vault.',
    hint: 'Corrige data-g-to o crea la nota destino. gaveta doctor --fix no repara enlaces rotos.',
  },
  E_META_MISSING: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'Falta un metadato obligatorio.',
    hint: 'La nota necesita title, gaveta:id, gaveta:type y gaveta:created.',
  },
  E_ID_DUPLICATE: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'Hay dos archivos con el mismo gaveta:id.',
    hint: 'gaveta doctor lista los dos. Deja un único archivo con ese id.',
  },
  E_HTML_INVALID: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'El HTML no se puede interpretar o tiene un elemento fuera del contrato.',
    hint: 'Consulta los elementos permitidos con gaveta guide.',
  },
  E_TYPE_STRUCTURE: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La estructura no corresponde al tipo de la nota.',
    hint: 'Una nota slides necesita al menos un section.slide; una nota doc, un article; una nota todo, un ul.tasks; dashboard, design y artifact tienen reglas propias (gaveta guide).',
  },
  E_ARTIFACT_SANDBOX: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'El iframe del artefacto no usa el sandbox permitido.',
    hint: 'Solo se admite sandbox="allow-scripts", sin allow-same-origin ni otras banderas.',
  },
  E_ARTIFACT_CSP: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La política CSP del srcdoc del artefacto no coincide con la nota.',
    hint: 'Vuelve a importar con --allow-cdn o quita los scripts remotos del HTML original.',
  },
  E_ARTIFACT_IFRAME: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La nota artifact debe tener un único iframe con srcdoc y sin src.',
    hint: 'Los scripts van solo dentro del srcdoc; no añadas más iframes ni atributos distintos.',
  },
  E_TASK_INVALID: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La tarea tiene atributos incorrectos.',
    hint: 'data-g-due tiene que ser una fecha ISO 8601 y data-g-priority uno de low, medium o high.',
  },
  E_UNSAFE_SCRIPT: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La nota contiene un script, que no está permitido.',
    hint: 'Hay que quitarlo. Gaveta no ejecuta código dentro de las notas.',
  },
  E_UNSAFE_HANDLER: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La nota contiene un atributo de evento (on*), que no está permitido.',
    hint: 'Hay que quitar los atributos que empiezan por on.',
  },
  E_UNSAFE_URL: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La nota contiene una URL javascript:, que no está permitida.',
    hint: 'Hay que usar una ruta relativa o una URL https.',
  },
  E_UNSAFE_ELEMENT: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La nota contiene un elemento no permitido por seguridad.',
    hint: 'No se admiten iframe, object, embed, form ni base.',
  },
  E_PATH_OUTSIDE_VAULT: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
    message: 'La ruta sale del vault.',
    hint: 'Hay que usar una ruta dentro del vault, sin .. ni enlaces simbólicos que salgan de él.',
  },
  E_CONFIG_INVALID: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'config.json no es válido: {detail}.',
    hint: 'Corrige .gaveta/config.json. Las claves desconocidas y los tipos incorrectos se rechazan.',
  },
  E_PATH_EXISTS: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
    message: 'El destino ya existe.',
    hint: 'Hay que elegir otra ruta.',
  },
  E_SKILL_PATH: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
    message: 'La ruta de instalación de la skill no es válida.',
    hint: 'No uses .. ni enlaces simbólicos que salgan del directorio del proyecto o del usuario.',
  },
  E_SKILL_MODIFIED: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
    message: 'La skill instalada fue modificada manualmente.',
    hint: 'Vuelve a instalar con --force si quieres sobrescribirla.',
  },
  E_HAS_BACKLINKS: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La nota tiene enlaces entrantes y no se puede borrar.',
    hint: 'Revisa los afectados o repite el comando con --force para convertirlos en pendientes.',
  },
  E_CONFLICT: {
    severity: 'error',
    exitCode: 3,
    escalatesToError: false,
    message: 'La nota ha cambiado desde la última lectura.',
    hint: 'Hay que volver a leer la nota y reintentar con el hash actual en --if-match.',
  },
  E_SECTION_NOT_FOUND: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
    message: 'No hay ninguna sección con ese id.',
    hint: 'Usa gaveta read --as outline para ver los ids de sección.',
  },
  E_TASK_NOT_FOUND: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
    message: 'No hay ninguna tarea con ese id en la nota.',
    hint: 'Usa gaveta todo list <ref> para ver los ids de tarea.',
  },
  W_LINK_PENDING: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Se ha creado un enlace pendiente.',
    hint: 'Crea la nota que falta o elige una de las sugerencias por similitud.',
  },
  W_LINK_HREF_STALE: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'El href no coincide con data-g-to.',
    hint: 'Ejecuta gaveta doctor --fix para recalcular la ruta relativa.',
  },
  W_NOTE_ORPHAN: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'La nota no tiene enlaces entrantes ni salientes.',
    hint: 'Enlázala con otra nota o bórrala si ya no hace falta.',
  },
  W_THEME_HREF: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'La ruta del tema no corresponde a la profundidad de la nota.',
    hint: 'Ejecuta gaveta doctor --fix para apuntar al tema con la ruta relativa correcta.',
  },
  W_MERMAID_ASSET_MISSING: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Faltan los scripts de Mermaid en .gaveta/ del vault.',
    hint: 'Ejecuta gaveta init en el vault o copia mermaid.min.js y mermaid-boot.js desde un vault nuevo.',
  },
  W_REL_UNKNOWN: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: true,
    message: 'El rel no está en el vocabulario del vault.',
    hint: 'Añádelo a la configuración o usa uno de los sugeridos. Con rel.strict esto pasa a ser un error.',
  },
  W_REMOTE_RESOURCE: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Se ha bloqueado un recurso remoto.',
    hint: 'Se puede descargar con --fetch-assets o permitir el dominio en remoteAllowlist.',
  },
  W_INLINE_STYLE_REMOVED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Se han eliminado {count} estilos en línea.',
    hint: 'El aspecto lo pone el tema del vault, no el atributo style.',
  },
  W_CLAUDE_DROPPED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Se ha omitido contenido del HTML de Claude ({detail}).',
    hint: 'Scripts, estilos en línea y etiquetas fuera del contrato no se conservan en tipos declarativos.',
  },
  W_CLASS_REMOVED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Se han eliminado {count} clases fuera del contrato.',
    hint: 'Solo se conservan las clases del contrato.',
  },
  W_UNSAFE_REMOVED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Se ha eliminado contenido inseguro al guardar.',
    hint: 'El archivo guardado ya no lo contiene.',
  },
  E_IMPORT_PARSE: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'No se ha podido interpretar el Markdown.',
    hint: 'Revisa el front matter YAML y la sintaxis del archivo.',
  },
  E_IMPORT_ABORTED: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
    message: 'La importación se ha abortado y no se ha escrito nada.',
    hint: 'Corrige el error o usa --continue-on-error.',
  },
  W_IMPORT_UNSUPPORTED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Hay sintaxis Markdown sin equivalente en el contrato.',
    hint: 'Se ha conservado como bloque HTML.',
  },
  W_IMPORT_SKIPPED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Se ha omitido un archivo.',
    hint: 'Es el resultado de --on-conflict skip o de --exclude.',
  },
  W_EXPORT_LOSSY: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'Parte de la nota no se puede representar en Markdown y se ha degradado.',
    hint: 'La salida JSON lista, por archivo, qué se ha degradado.',
  },
  E_RUNTIME_UNSUPPORTED: {
    severity: 'error',
    exitCode: 5,
    escalatesToError: false,
    message:
      'Este entorno no es compatible: Node {version} detectado; se requiere Node {minimum} o superior.',
    hint: 'Instala una versión reciente de Node (por ejemplo `nvm install 22` o `brew install node`) y vuelve a ejecutar gaveta.',
  },
  E_INDEX_CORRUPT: {
    severity: 'error',
    exitCode: 5,
    escalatesToError: false,
    message: 'El índice SQLite está dañado y no se ha podido rehacer.',
    hint: 'Borra .gaveta/index.sqlite y ejecuta gaveta reindex. Los archivos de las notas no cambian.',
  },
  W_INDEX_RECOVERED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'El índice estaba dañado o era incompatible y se ha creado de nuevo.',
    hint: 'Los archivos no se han modificado. gaveta reindex lo vuelve a llenar.',
  },
  W_SKILL_OUTDATED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
    message: 'La skill instalada es más antigua que esta versión de la CLI.',
    hint: 'Ejecuta gaveta skill install para actualizarla.',
  },
} as const satisfies Record<string, DiagnosticSpec>;

export type DiagnosticCode = keyof typeof DIAGNOSTICS;

export type ErrorCode = {
  [Code in DiagnosticCode]: (typeof DIAGNOSTICS)[Code]['severity'] extends 'error' ? Code : never;
}[DiagnosticCode];

export type WarningCode = {
  [Code in DiagnosticCode]: (typeof DIAGNOSTICS)[Code]['severity'] extends 'warning' ? Code : never;
}[DiagnosticCode];

export function diagnosticCodes(): DiagnosticCode[] {
  const codes: DiagnosticCode[] = [];
  for (const key of Object.keys(DIAGNOSTICS)) {
    if (isDiagnosticCode(key)) {
      codes.push(key);
    }
  }
  return codes;
}

export function isDiagnosticCode(value: string): value is DiagnosticCode {
  return Object.hasOwn(DIAGNOSTICS, value);
}

export function isErrorCode(value: string): value is ErrorCode {
  return isDiagnosticCode(value) && DIAGNOSTICS[value].severity === 'error';
}

export function isWarningCode(value: string): value is WarningCode {
  return isDiagnosticCode(value) && DIAGNOSTICS[value].severity === 'warning';
}

export function exitCodeFor(
  code: DiagnosticCode,
  options: { readonly strictRel?: boolean } = {},
): 1 | 2 | 3 | 4 | 5 | null {
  const spec = DIAGNOSTICS[code];
  if (spec.escalatesToError && options.strictRel === true) {
    return EXIT_CODES.validation;
  }
  return spec.exitCode;
}

export function formatDiagnostic(
  code: DiagnosticCode,
  params: Readonly<Record<string, string | number>> = {},
): { message: string; hint: string } {
  const spec = DIAGNOSTICS[code];
  return {
    message: fill(spec.message, params),
    hint: fill(spec.hint, params),
  };
}

export class GavetaError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;

  constructor(code: ErrorCode, params: Readonly<Record<string, string | number>> = {}) {
    const formatted = formatDiagnostic(code, params);
    super(formatted.message);
    this.name = 'GavetaError';
    this.code = code;
    this.hint = formatted.hint;
  }
}

function fill(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([A-Za-z0-9]+)\}/g, (match: string, key: string): string => {
    if (!Object.hasOwn(params, key)) {
      return match;
    }
    const value = params[key];
    if (value === undefined) {
      return match;
    }
    return String(value);
  });
}
