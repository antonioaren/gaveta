import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../cli/src');
const strings = new Map();

function add(key, value) {
  if (!strings.has(key)) {
    strings.set(key, value);
    return;
  }
  if (strings.get(key) !== value) {
    throw new Error(`Duplicate key ${key}: ${strings.get(key)} vs ${value}`);
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const patterns = [
    /summary:\s*'([^']+)'/g,
    /description:\s*'([^']+)'/g,
    /problem:\s*'([^']+)'/g,
    /const\s+[A-Z_]+\s*=\s*'([^']+)';/g,
    /const\s+[A-Z_]+\s*=\s*\n\s*'([^']+)';/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) {
      const value = m[1];
      if (value.length < 4 || /^[a-z]+\.[a-z]/.test(value)) {
        continue;
      }
      const key = `cli.auto.${slugify(value)}`;
      add(key, value);
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      walk(full);
    } else if (name.name.endsWith('.ts') && !name.name.endsWith('.test.ts')) {
      scanFile(full);
    }
  }
}

walk(root);
for (const file of ['help.ts', 'envelope.ts', 'input.ts', 'run.ts']) {
  scanFile(join(root, file));
}

const sorted = [...strings.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const es = Object.fromEntries(sorted);
writeFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/catalog/cli.es.auto.json'),
  JSON.stringify(es, null, 2),
);
globalThis.console.log('extracted', sorted.length);
