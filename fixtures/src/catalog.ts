import { REL_VOCABULARY, type Rel, type ValidatorCode } from './constants.ts';

export type NoteType = 'doc' | 'slides' | 'todo';

export interface FixtureNoteSpec {
  path: string;
  id: string;
  type: NoteType;
  title: string;
  tags?: string;
  aliases?: string;
}

export interface MaliciousNoteSpec extends FixtureNoteSpec {
  caseId: string;
  codes: readonly ValidatorCode[];
  payloads: readonly string[];
}

/** Note X. Twenty other notes in the backlinks vault point here with `data-g-to`. */
export const NOTE_X = {
  id: '01M5HGV8800000000000000001',
  path: 'nota-x.html',
  title: 'Nota X',
  aliases: 'Nota equis',
} as const;

/** Valid ULID that no fixture note uses. The broken-link specimen points here. */
export const MISSING_ID = '01M5HGV88000000000000000ZZ';

/** Shared by `dup/duplicado-alfa.html` and `dup/duplicado-beta.html`. */
export const DUPLICATE_ID = '01M5HGV880000000000000000X';

export const BACKLINK_COUNT = 20;

const LINKER_IDS = [
  '01M5HGV8800000000000000004',
  '01M5HGV8800000000000000005',
  '01M5HGV8800000000000000006',
  '01M5HGV8800000000000000007',
  '01M5HGV8800000000000000008',
  '01M5HGV8800000000000000009',
  '01M5HGV880000000000000000A',
  '01M5HGV880000000000000000B',
  '01M5HGV880000000000000000C',
  '01M5HGV880000000000000000D',
  '01M5HGV880000000000000000E',
  '01M5HGV880000000000000000F',
  '01M5HGV880000000000000000G',
  '01M5HGV880000000000000000H',
  '01M5HGV880000000000000000J',
  '01M5HGV880000000000000000K',
  '01M5HGV880000000000000000M',
  '01M5HGV880000000000000000N',
  '01M5HGV880000000000000000P',
  '01M5HGV880000000000000000Q',
] as const;

export function linkerRel(oneBasedIndex: number): Rel {
  const rel = REL_VOCABULARY[(oneBasedIndex - 1) % REL_VOCABULARY.length];
  if (rel === undefined) {
    throw new Error('rel vocabulary is empty');
  }
  return rel;
}

export function linkerSpec(oneBasedIndex: number): FixtureNoteSpec {
  if (oneBasedIndex < 1 || oneBasedIndex > BACKLINK_COUNT) {
    throw new Error(`linker index must be 1..${String(BACKLINK_COUNT)}`);
  }
  const id = LINKER_IDS[oneBasedIndex - 1];
  if (id === undefined) {
    throw new Error(`missing linker id ${String(oneBasedIndex)}`);
  }
  const stamp = String(oneBasedIndex).padStart(2, '0');
  const name = `enlace-${stamp}.html`;
  let type: NoteType = 'doc';
  if (oneBasedIndex === 19) {
    type = 'slides';
  } else if (oneBasedIndex === 20) {
    type = 'todo';
  }
  return {
    path: oneBasedIndex <= 10 ? `enlaces/${name}` : `enlaces/mas/${name}`,
    id,
    type,
    title: `Enlace ${stamp}`,
    tags: 'backlink',
  };
}

export const BACKLINKS: readonly FixtureNoteSpec[] = [
  {
    path: NOTE_X.path,
    id: NOTE_X.id,
    type: 'doc',
    title: NOTE_X.title,
    tags: 'fixture, backlinks',
    aliases: NOTE_X.aliases,
  },
  {
    path: 'destino-enlace.html',
    id: '01M5HGV8800000000000000002',
    type: 'doc',
    title: 'Destino enlace',
    tags: 'fixture',
  },
  {
    path: 'formas-de-enlace.html',
    id: '01M5HGV8800000000000000003',
    type: 'doc',
    title: 'Formas de enlace',
    tags: 'fixture',
  },
  ...Array.from({ length: BACKLINK_COUNT }, (_, index) => linkerSpec(index + 1)),
];

export const PROBLEMS: readonly FixtureNoteSpec[] = [
  {
    path: 'nota-sana.html',
    id: '01M5HGV880000000000000000R',
    type: 'doc',
    title: 'Nota sana',
    tags: 'problema',
  },
  {
    path: 'nota-destino.html',
    id: '01M5HGV880000000000000000S',
    type: 'doc',
    title: 'Nota destino',
    tags: 'problema',
  },
  {
    path: 'nota-rota.html',
    id: '01M5HGV880000000000000000T',
    type: 'doc',
    title: 'Nota rota',
    tags: 'problema',
  },
  {
    path: 'nota-pendiente.html',
    id: '01M5HGV880000000000000000V',
    type: 'doc',
    title: 'Nota pendiente',
    tags: 'problema',
  },
  {
    path: 'nota-huerfana.html',
    id: '01M5HGV880000000000000000W',
    type: 'doc',
    title: 'Nota huérfana',
  },
  {
    path: 'dup/duplicado-alfa.html',
    id: DUPLICATE_ID,
    type: 'doc',
    title: 'Duplicado alfa',
    tags: 'problema',
  },
  {
    path: 'dup/duplicado-beta.html',
    id: DUPLICATE_ID,
    type: 'doc',
    title: 'Duplicado beta',
    tags: 'problema',
  },
  {
    path: 'nota-invalida.html',
    id: '01M5HGV880000000000000000Y',
    type: 'todo',
    title: 'Nota inválida',
    tags: 'problema',
  },
  {
    path: 'href-desfasado.html',
    id: '01M5HGV880000000000000000Z',
    type: 'doc',
    title: 'Href desfasado',
    tags: 'problema',
  },
  {
    path: 'anidada/ruta-del-tema.html',
    id: '01M5HGV8800000000000000010',
    type: 'doc',
    title: 'Ruta del tema',
    tags: 'problema',
  },
];

export const GHOST_TITLE = 'Nota fantasma';

export const MALICIOUS: readonly MaliciousNoteSpec[] = [
  {
    path: 'script.html',
    id: '01M5HGV8800000000000000011',
    type: 'doc',
    title: 'Script',
    tags: 'malicioso',
    caseId: 'script',
    codes: ['E_UNSAFE_SCRIPT'],
    payloads: ['<script>', 'alert(1);', 'src="https://evil.example/hook.js"'],
  },
  {
    path: 'handler.html',
    id: '01M5HGV8800000000000000012',
    type: 'doc',
    title: 'Handler',
    tags: 'malicioso',
    caseId: 'handler',
    codes: ['E_UNSAFE_HANDLER'],
    payloads: ['onerror="alert(1)"', 'onclick="alert(1)"', 'onload="alert(1)"'],
  },
  {
    path: 'url-javascript.html',
    id: '01M5HGV8800000000000000013',
    type: 'doc',
    title: 'URL javascript',
    tags: 'malicioso',
    caseId: 'javascript-url',
    codes: ['E_UNSAFE_URL'],
    payloads: [
      'href="javascript:alert(1)"',
      'href="JAVASCRIPT:alert(1)"',
      'href=" javascript:alert(1)"',
    ],
  },
  {
    path: 'iframe.html',
    id: '01M5HGV8800000000000000014',
    type: 'doc',
    title: 'Iframe',
    tags: 'malicioso',
    caseId: 'iframe',
    codes: ['E_UNSAFE_ELEMENT'],
    payloads: ['<iframe', 'src="https://evil.example/frame.html"', 'src="data:text/html,hello"'],
  },
  {
    path: 'object.html',
    id: '01M5HGV8800000000000000015',
    type: 'doc',
    title: 'Object',
    tags: 'malicioso',
    caseId: 'object',
    codes: ['E_UNSAFE_ELEMENT'],
    payloads: ['<object', 'data="https://evil.example/plugin.swf"'],
  },
  {
    path: 'embed.html',
    id: '01M5HGV8800000000000000016',
    type: 'doc',
    title: 'Embed',
    tags: 'malicioso',
    caseId: 'embed',
    codes: ['E_UNSAFE_ELEMENT'],
    payloads: ['<embed', 'src="https://evil.example/plugin.swf"'],
  },
  {
    path: 'formulario.html',
    id: '01M5HGV8800000000000000017',
    type: 'doc',
    title: 'Formulario',
    tags: 'malicioso',
    caseId: 'form',
    codes: ['E_UNSAFE_ELEMENT'],
    payloads: ['<form', 'action="https://evil.example/collect"'],
  },
  {
    path: 'base.html',
    id: '01M5HGV8800000000000000018',
    type: 'doc',
    title: 'Base',
    tags: 'malicioso',
    caseId: 'base',
    codes: ['E_UNSAFE_ELEMENT'],
    payloads: ['<base', 'href="https://evil.example/"'],
  },
  {
    path: 'imagen-remota.html',
    id: '01M5HGV8800000000000000019',
    type: 'doc',
    title: 'Imagen remota',
    tags: 'malicioso',
    caseId: 'remote-image',
    codes: ['W_REMOTE_RESOURCE'],
    payloads: [
      'src="https://evil.example/pixel.png"',
      'src="http://evil.example/pixel.png"',
      'src="//evil.example/pixel.png"',
      'srcset="https://evil.example/2x.png 2x"',
    ],
  },
  {
    path: 'hoja-remota.html',
    id: '01M5HGV880000000000000001A',
    type: 'doc',
    title: 'Hoja remota',
    tags: 'malicioso',
    caseId: 'remote-stylesheet',
    codes: ['W_REMOTE_RESOURCE'],
    payloads: ['href="https://evil.example/evil.css"', 'href="https://evil.example/font.woff2"'],
  },
  {
    path: 'path-traversal.html',
    id: '01M5HGV880000000000000001B',
    type: 'doc',
    title: 'Path traversal',
    tags: 'malicioso',
    caseId: 'path-traversal',
    codes: [],
    payloads: [
      'href="../../fuera.html"',
      'href="/etc/passwd"',
      'href="..\\..\\fuera.html"',
      'src="../../fuera.png"',
      'src="attachments/../../fuera.png"',
    ],
  },
  {
    path: 'meta-refresh.html',
    id: '01M5HGV880000000000000001C',
    type: 'doc',
    title: 'Meta refresh',
    tags: 'malicioso',
    caseId: 'meta-refresh',
    codes: [],
    payloads: ['http-equiv="refresh"', 'content="0;url=https://evil.example/"'],
  },
  {
    path: 'estilo-inline.html',
    id: '01M5HGV880000000000000001D',
    type: 'doc',
    title: 'Estilo inline',
    tags: 'malicioso',
    caseId: 'inline-style',
    codes: ['W_INLINE_STYLE_REMOVED', 'W_REMOTE_RESOURCE'],
    payloads: [
      'style="background-image: url(https://evil.example/bg.png)"',
      'style="width: expression(alert(1))"',
    ],
  },
  {
    path: 'combinada.html',
    id: '01M5HGV880000000000000001E',
    type: 'doc',
    title: 'Combinada',
    tags: 'malicioso',
    caseId: 'combined',
    codes: ['E_UNSAFE_SCRIPT', 'E_UNSAFE_HANDLER', 'W_REMOTE_RESOURCE'],
    payloads: ['<script>', 'onerror="alert(1)"', 'src="https://evil.example/pixel.png"'],
  },
];
