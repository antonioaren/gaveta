export interface InspectedAnchor {
  href: string | null;
  to: string | null;
  pending: string | null;
  rel: string | null;
  text: string;
}

export interface InspectedImage {
  src: string | null;
  srcset: string | null;
}

export interface InspectedMeta {
  name: string;
  content: string;
}

export interface InspectedNote {
  lang: string | null;
  charset: string | null;
  title: string | null;
  h1: string | null;
  metas: InspectedMeta[];
  stylesheetHrefs: string[];
  anchors: InspectedAnchor[];
  images: InspectedImage[];
  wikilinks: string[];
  dues: string[];
  priorities: string[];
  hasArticle: boolean;
  hasSlide: boolean;
  hasSpeakerNotes: boolean;
  hasTaskList: boolean;
  hasTaskMarker: boolean;
  checkboxes: { checked: boolean }[];
}

function openingTags(html: string, name: string): string[] {
  const pattern = new RegExp(`<${name}(?=[\\s>/])[^>]*>`, 'gi');
  return [...html.matchAll(pattern)].map((match) => match[0]);
}

function attributes(tag: string): Map<string, string> {
  const map = new Map<string, string>();
  const body = tag.replace(/^<\/?[A-Za-z0-9:-]+\s*/, '').replace(/\/?>$/, '');
  const pattern = /([^\s"'>/=]+)(?:\s*=\s*"([^"]*)")?/g;
  for (const match of body.matchAll(pattern)) {
    const name = match[1];
    if (name === undefined) {
      continue;
    }
    map.set(name, match[2] ?? '');
  }
  return map;
}

function visibleText(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function optionalAttribute(map: Map<string, string>, name: string): string | null {
  return map.get(name) ?? null;
}

export function inspectNote(html: string): InspectedNote {
  const htmlTag = openingTags(html, 'html')[0];
  const lang = htmlTag === undefined ? null : (attributes(htmlTag).get('lang') ?? null);

  let charset: string | null = null;
  const metas: InspectedMeta[] = [];
  for (const tag of openingTags(html, 'meta')) {
    const map = attributes(tag);
    const charsetValue = map.get('charset');
    if (charsetValue !== undefined && charset === null) {
      charset = charsetValue;
    }
    const name = map.get('name');
    const content = map.get('content');
    if (name !== undefined && content !== undefined) {
      metas.push({ name, content });
    }
  }

  const stylesheetHrefs: string[] = [];
  for (const tag of openingTags(html, 'link')) {
    const map = attributes(tag);
    if (map.get('rel') === 'stylesheet') {
      const href = map.get('href');
      if (href !== undefined) {
        stylesheetHrefs.push(href);
      }
    }
  }

  const anchors: InspectedAnchor[] = [];
  // Prettier may split `</a>` across lines (`</a` + `>`).
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)) {
    const full = match[0];
    const openEnd = full.indexOf('>');
    const close = /<\/a\s*>$/i.exec(full);
    const open = openEnd === -1 ? full : full.slice(0, openEnd + 1);
    const inner = close === null || openEnd === -1 ? '' : full.slice(openEnd + 1, close.index);
    const map = attributes(open);
    anchors.push({
      href: optionalAttribute(map, 'href'),
      to: optionalAttribute(map, 'data-g-to'),
      pending: optionalAttribute(map, 'data-g-pending'),
      rel: optionalAttribute(map, 'rel'),
      text: visibleText(inner),
    });
  }

  const images: InspectedImage[] = openingTags(html, 'img').map((tag) => {
    const map = attributes(tag);
    return {
      src: optionalAttribute(map, 'src'),
      srcset: optionalAttribute(map, 'srcset'),
    };
  });

  const dues: string[] = [];
  const priorities: string[] = [];
  for (const tag of html.matchAll(/<[A-Za-z][\w:-]*\b[^>]*>/g)) {
    const full = tag[0];
    const map = attributes(full);
    const due = map.get('data-g-due');
    if (due !== undefined) {
      dues.push(due);
    }
    const priority = map.get('data-g-priority');
    if (priority !== undefined) {
      priorities.push(priority);
    }
  }

  const titleMatch = /<title>([^<]*)<\/title>/.exec(html);
  const h1Match = /<h1>([^<]*)<\/h1>/.exec(html);

  return {
    lang,
    charset,
    title: titleMatch?.[1] ?? null,
    h1: h1Match?.[1] ?? null,
    metas,
    stylesheetHrefs,
    anchors,
    images,
    wikilinks: [...html.matchAll(/\[\[[^\]\r\n]+\]\]/g)].map((match) => match[0]),
    dues,
    priorities,
    hasArticle: /<article\b[^>]*>/i.test(html),
    hasSlide: openingTags(html, 'section').some((tag) =>
      (attributes(tag).get('class') ?? '').split(/\s+/).includes('slide'),
    ),
    hasSpeakerNotes: openingTags(html, 'aside').some((tag) =>
      (attributes(tag).get('class') ?? '').split(/\s+/).includes('notes'),
    ),
    hasTaskList: openingTags(html, 'ul').some((tag) =>
      (attributes(tag).get('class') ?? '').split(/\s+/).includes('tasks'),
    ),
    hasTaskMarker: /data-g-task(?=[\s=/>])/i.test(html),
    checkboxes: openingTags(html, 'input')
      .filter((tag) => attributes(tag).get('type') === 'checkbox')
      .map((tag) => ({ checked: attributes(tag).has('checked') })),
  };
}

export function metaContents(note: InspectedNote, name: string): string[] {
  return note.metas.filter((meta) => meta.name === name).map((meta) => meta.content);
}
