import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NOTE_TYPES, type NoteType } from '../contract.ts';
import { GavetaError } from '../errors.ts';
import { escapeText } from '../links/path.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import { pathOutsideVault } from './errors.ts';
import { hasNodeErrorCode } from './node-error.ts';
import { isInsideVault, readVaultText, writeVaultText } from './paths.ts';

export const NOTE_TEMPLATES_DIRECTORY = `${GAVETA_DIRECTORY}/templates`;

export function noteTemplateRelativePath(type: NoteType): string {
  return `${NOTE_TEMPLATES_DIRECTORY}/${type}.html`;
}

/** Body fragment for a new note when no custom HTML is supplied. Use `{{title}}` for the title. */
export function defaultNoteTemplateBody(type: NoteType): string {
  const heading = '{{title}}';
  if (type === 'slides') {
    return `<section class="slide"><h2>${heading}</h2></section>`;
  }
  if (type === 'todo') {
    return `<h1>${heading}</h1>`;
  }
  if (type === 'dashboard') {
    return `<article class="g-dashboard"><h1>${heading}</h1></article>`;
  }
  if (type === 'design') {
    return `<section class="g-frame" data-device="desktop" id="pantalla"><h2>${heading}</h2></section>`;
  }
  if (type === 'artifact') {
    return `<article><h1>${heading}</h1><section id="descripcion"><p>${heading}</p></section><iframe sandbox="allow-scripts" title="${heading}" srcdoc="&lt;!doctype html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;meta http-equiv=&quot;Content-Security-Policy&quot; content=&quot;default-src &apos;none&apos;; script-src &apos;unsafe-inline&apos;; style-src &apos;unsafe-inline&apos;; connect-src &apos;none&apos;&quot;&gt;&lt;/head&gt;&lt;body&gt;&lt;p&gt;Vacío&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;"></iframe></article>`;
  }
  return `<article><h1>${heading}</h1></article>`;
}

export function applyNoteTemplateVariables(template: string, title: string): string {
  const escaped = escapeText(title);
  return template.replaceAll('{{title}}', () => escaped);
}

export async function readNoteTemplateBody(
  vaultRoot: string,
  type: NoteType,
): Promise<string | null> {
  const relative = noteTemplateRelativePath(type);
  const absolute = path.join(vaultRoot, ...relative.split('/'));
  if (!isInsideVault(vaultRoot, absolute)) {
    throw pathOutsideVault();
  }
  const listed = await lstatOrNull(absolute);
  if (listed === null) {
    return null;
  }
  if (listed.isSymbolicLink()) {
    throw pathOutsideVault();
  }
  if (!listed.isFile()) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const text = await readVaultText(vaultRoot, relative);
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : text;
}

export interface NoteTemplateInitResult {
  readonly created: readonly string[];
  readonly preserved: readonly string[];
}

export async function writeDefaultNoteTemplates(
  vaultRoot: string,
): Promise<NoteTemplateInitResult> {
  const created: string[] = [];
  const preserved: string[] = [];
  const templatesRoot = path.join(vaultRoot, ...NOTE_TEMPLATES_DIRECTORY.split('/'));
  if (!isInsideVault(vaultRoot, templatesRoot)) {
    throw pathOutsideVault();
  }
  await mkdir(templatesRoot, { recursive: true });
  for (const type of NOTE_TYPES) {
    const relative = noteTemplateRelativePath(type);
    const absolute = path.join(vaultRoot, ...relative.split('/'));
    if (!isInsideVault(vaultRoot, absolute)) {
      throw pathOutsideVault();
    }
    const listed = await lstatOrNull(absolute);
    if (listed !== null) {
      if (listed.isSymbolicLink()) {
        throw pathOutsideVault();
      }
      preserved.push(relative);
      continue;
    }
    await writeVaultText(vaultRoot, relative, `${defaultNoteTemplateBody(type)}\n`);
    created.push(relative);
  }
  return { created, preserved };
}

export async function resolveCreateNoteBodyHtml(
  vaultRoot: string,
  type: NoteType,
  title: string,
  html: string | null,
): Promise<string | null> {
  if (html !== null && html.trim().length > 0) {
    return html;
  }
  const template = await readNoteTemplateBody(vaultRoot, type);
  if (template === null) {
    return html;
  }
  return applyNoteTemplateVariables(template, title);
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}
