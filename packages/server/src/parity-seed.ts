import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MENTION_TARGET_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHE';
const MENTION_SOURCE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';

const ROADMAP_PARITY_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Roadmap Parity</title><meta name="gaveta:id" content="${MENTION_TARGET_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00.000Z"></head><body><article><h1>Roadmap Parity</h1><section id="cuerpo"><p>x</p></section></article></body></html>`;

const UNO_PARITY_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Uno Parity</title><meta name="gaveta:id" content="${MENTION_SOURCE_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00.000Z"></head><body><article><h1>Uno Parity</h1><section id="cuerpo"><p>Roadmap Parity here.</p></section></article></body></html>`;

export const MENTION_PARITY_TARGET_REF = 'Roadmap Parity';
export const MENTION_PARITY_SOURCE_PATH = 'uno-parity.html';

export function seedMentionParityNotes(vaultRoot: string): void {
  writeFileSync(join(vaultRoot, 'roadmap-parity.html'), ROADMAP_PARITY_HTML, 'utf8');
  writeFileSync(join(vaultRoot, 'uno-parity.html'), UNO_PARITY_HTML, 'utf8');
}
