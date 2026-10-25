import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '../../cli/src');
const es = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src/catalog/cli.es.auto.json'),
    'utf8',
  ),
);
const valueToKey = new Map(Object.entries(es));

const skipValues = new Set(['E_INTERNAL', '@gaveta/cli', '\\u001e']);

function replaceInFile(path) {
  let src = readFileSync(path, 'utf8');
  let changed = false;
  for (const [key, value] of valueToKey) {
    if (skipValues.has(value)) {
      continue;
    }
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const patterns = [`'${escaped}'`, `'${value.replace(/\\n/g, '\\\\n')}'`];
    for (const pattern of patterns) {
      if (src.includes(pattern)) {
        src = src.split(pattern).join(`'${key}'`);
        changed = true;
      }
    }
  }
  if (changed) {
    writeFileSync(path, src);
    globalThis.console.log('updated', path);
  }
}

function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      walk(full);
    } else if (name.name.endsWith('.ts') && !name.name.endsWith('.test.ts')) {
      replaceInFile(full);
    }
  }
}

walk(cliRoot);
for (const file of ['help.ts', 'envelope.ts', 'input.ts', 'run.ts']) {
  replaceInFile(join(cliRoot, file));
}
