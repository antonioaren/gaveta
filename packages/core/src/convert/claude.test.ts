import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeNote } from '../normalize.ts';
import { parseNote } from '../parser.ts';
import { validateNote } from '../validate.ts';
import { convertClaudeHtml } from './claude.ts';

const FIXTURES = join(import.meta.dirname, '../../../../fixtures/claude');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('convertClaudeHtml', () => {
  it('maps a Claude document into a doc note body', () => {
    const result = convertClaudeHtml(fixture('doc.html'));
    expect(result.type).toBe('doc');
    expect(result.title).toBe('Guía de onboarding');
    expect(result.body).toContain('<article>');
    expect(result.body).toContain('Primeros pasos');
    expect(result.body).toContain('<table>');
    expect(result.body).not.toContain('<script');
    const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>T</title><meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T00:00:00.000Z"></head><body>${result.body}</body></html>`;
    const normalized = normalizeNote(shell, { notePath: 'onboarding.html' });
    expect(normalized.html).not.toBeNull();
    expect(validateNote(normalized.html ?? '', { notePath: 'onboarding.html' }).ok).toBe(true);
  });

  it('maps slide decks to slides', () => {
    const result = convertClaudeHtml(fixture('slides.html'));
    expect(result.type).toBe('slides');
    expect(result.body).toContain('section class="slide"');
    expect(result.body.match(/section class="slide"/g)?.length).toBe(2);
  });

  it('maps dashboards to declarative KPI and chart markup', () => {
    const result = convertClaudeHtml(fixture('dashboard.html'));
    expect(result.type).toBe('dashboard');
    expect(result.body).toContain('gaveta-kpi');
    expect(result.body).toContain('gaveta-chart');
  });

  it('maps mockups to design frames', () => {
    const result = convertClaudeHtml(fixture('design.html'));
    expect(result.type).toBe('design');
    expect(result.body).toContain('g-frame');
    expect(result.body).toContain('data-device="mobile"');
  });

  it('wraps interactive React output as artifact', () => {
    const result = convertClaudeHtml(fixture('react-app.html'), { allowCdn: true });
    expect(result.type).toBe('artifact');
    expect(result.body).toContain('<iframe');
    expect(result.body).toContain('sandbox="allow-scripts"');
    expect(result.allowCdn).toBe(true);
    const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>T</title><meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC"><meta name="gaveta:type" content="artifact"><meta name="gaveta:created" content="2026-10-22T00:00:00.000Z"><meta name="gaveta:artifact-cdn" content="true"></head><body>${result.body}</body></html>`;
    expect(validateNote(shell, { notePath: 'demo.html' }).ok).toBe(true);
    const indexed = parseNote(shell);
    expect(indexed.note?.plainText).toContain('Contador');
  });
});
