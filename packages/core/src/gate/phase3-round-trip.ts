import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { FIXTURES_ROOT, vaultPath } from '@gaveta/fixtures';
import { noteSemanticSnapshot, type NoteSemanticSnapshot } from '../convert/round-trip.ts';
import { importMarkdownFolder } from '../import/folder.ts';
import { normalizeNote } from '../normalize.ts';
import { parseNote, type NoteSection } from '../parser.ts';
import { initVault } from '../vault/init.ts';

export interface Phase3FixtureNote {
  readonly corpus: string;
  readonly path: string;
  readonly html: string;
}

export interface Phase3SectionSnapshot {
  readonly id: string | null;
  readonly plainText: string;
  readonly heading: string | null;
}

export interface Phase3SemanticSnapshot extends NoteSemanticSnapshot {
  readonly type: string | null;
  readonly plainText: string;
  readonly sections: readonly Phase3SectionSnapshot[];
}

export interface Phase3RoundTripFailure {
  readonly corpus: string;
  readonly path: string;
  readonly stage: string;
  readonly detail: string;
}

function walkHtmlFiles(directory: string, root = directory): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (entry.isDirectory()) {
      found.push(...walkHtmlFiles(absolute, root));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      found.push(path);
    }
  }
  return found.sort();
}

function loadCorpus(corpus: string, root: string): Phase3FixtureNote[] {
  return walkHtmlFiles(root).map((path) => ({
    corpus,
    path,
    html: readFileSync(join(root, path), 'utf8'),
  }));
}

const STATIC_CORPORA: readonly { readonly corpus: string; readonly root: string }[] = [
  { corpus: 'vaults/backlinks', root: vaultPath('backlinks') },
  { corpus: 'vaults/problems', root: vaultPath('problems') },
  { corpus: 'vaults/malicious', root: vaultPath('malicious') },
  { corpus: 'showcase', root: join(FIXTURES_ROOT, 'showcase') },
  { corpus: 'claude', root: join(FIXTURES_ROOT, 'claude') },
];

export function listPhase3StaticFixtureNotes(): Phase3FixtureNote[] {
  const notes: Phase3FixtureNote[] = [];
  for (const { corpus, root } of STATIC_CORPORA) {
    notes.push(...loadCorpus(corpus, root));
  }
  return notes;
}

export async function listPhase3Gate1MarkdownNotes(): Promise<Phase3FixtureNote[]> {
  const { mkdtemp, rm, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { markdownVaultPath } = await import('@gaveta/fixtures');
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-gate3-md-'));
  const vaultRoot = join(parent, 'vault');
  try {
    await mkdir(vaultRoot);
    await initVault({ cwd: parent, directory: 'vault' });
    await importMarkdownFolder({ vaultRoot, sourcePath: markdownVaultPath() });
    return loadCorpus('gate-1/markdown-import', vaultRoot).map((note) => ({
      ...note,
      corpus: 'gate-1/markdown-import',
    }));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function flattenSections(sections: readonly NoteSection[]): Phase3SectionSnapshot[] {
  const out: Phase3SectionSnapshot[] = [];
  const visit = (list: readonly NoteSection[]): void => {
    for (const section of list) {
      const heading =
        section.heading === null
          ? null
          : `${String(section.heading.level)}:${section.heading.text.trim()}`;
      out.push({
        id: section.id,
        plainText: section.plainText.trim(),
        heading,
      });
      visit(section.children);
    }
  };
  visit(sections);
  return out;
}

export function phase3SemanticSnapshot(html: string): Phase3SemanticSnapshot {
  const semantic = noteSemanticSnapshot(html);
  const parsed = parseNote(html);
  const note = parsed.note;
  if (note === null) {
    throw new Error('parseNote returned no model');
  }
  return {
    ...semantic,
    type: note.type,
    plainText: note.plainText.trim(),
    sections: flattenSections(note.sections),
  };
}

export function snapshotsEqual(
  left: Phase3SemanticSnapshot,
  right: Phase3SemanticSnapshot,
): string | null {
  const a = JSON.stringify(left);
  const b = JSON.stringify(right);
  if (a === b) {
    return null;
  }
  return `semantic diff:\n${a}\n---\n${b}`;
}

export function normalizeFixtureHtml(html: string, notePath: string): string | null {
  const normalized = normalizeNote(html, { notePath });
  return normalized.ok && normalized.html !== null ? normalized.html : null;
}

export function runPhase3CodeSave(html: string, notePath: string): string | null {
  return normalizeFixtureHtml(html, notePath);
}

export interface Phase3VisualRoundTrip {
  readonly noteHtmlToEditorJson: (html: string) => unknown;
  readonly editorJsonToNoteHtml: (document: unknown) => string;
}

export function runPhase3VisualSave(
  html: string,
  notePath: string,
  editor: Phase3VisualRoundTrip,
): string | null {
  const json = editor.noteHtmlToEditorJson(html);
  const round = editor.editorJsonToNoteHtml(json);
  return normalizeFixtureHtml(round, notePath);
}

export function runPhase3RoundTripPipeline(
  sourceHtml: string,
  notePath: string,
  editor: Phase3VisualRoundTrip,
  corpus = '',
): { readonly html: string | null; readonly failures: Phase3RoundTripFailure[] } {
  const failures: Phase3RoundTripFailure[] = [];
  const push = (stage: string, detail: string): void => {
    failures.push({ corpus, path: notePath, stage, detail });
  };

  const baseline = normalizeFixtureHtml(sourceHtml, notePath);
  if (baseline === null) {
    push('normalize-source', 'normalizeNote failed on fixture source');
    return { html: null, failures };
  }

  const afterVisual = runPhase3VisualSave(baseline, notePath, editor);
  if (afterVisual === null) {
    push('visual-save', 'normalizeNote failed after visual editor round-trip');
    return { html: null, failures };
  }

  const afterCode = runPhase3CodeSave(afterVisual, notePath);
  if (afterCode === null) {
    push('code-save', 'normalizeNote failed after code-mode save');
    return { html: null, failures };
  }

  const afterSecondCode = runPhase3CodeSave(afterCode, notePath);
  if (afterSecondCode === null) {
    push('idempotent', 'normalizeNote failed on second code pass');
    return { html: null, failures };
  }

  if (afterSecondCode !== afterCode) {
    push(
      'idempotent',
      `canonical HTML changed on second normalize (len ${String(afterCode.length)} → ${String(afterSecondCode.length)})`,
    );
  }

  const expected = phase3SemanticSnapshot(baseline);
  const actual = phase3SemanticSnapshot(afterCode);
  const semanticDiff = snapshotsEqual(expected, actual);
  if (semanticDiff !== null) {
    push('semantic', semanticDiff);
  }

  return { html: afterCode, failures };
}

export function assertMaliciousSanitized(html: string, notePath: string): string | null {
  const lowered = html.toLowerCase();
  const forbidden = [
    '<script',
    'javascript:',
    'onerror=',
    'onload=',
    '<iframe',
    '<object',
    '<embed',
  ];
  for (const needle of forbidden) {
    if (lowered.includes(needle)) {
      return `sanitized html still contains ${needle}`;
    }
  }
  const normalized = normalizeFixtureHtml(html, notePath);
  if (normalized === null) {
    return 'normalize failed on round-trip output';
  }
  return null;
}

export function isMaliciousCorpus(corpus: string): boolean {
  return corpus === 'vaults/malicious';
}
