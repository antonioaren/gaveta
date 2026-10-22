import './warning.ts';
import { DatabaseSync } from 'node:sqlite';
import { GAVETA_DIRECTORY } from '../vault/constants.ts';
import { cellText, cellTextOrNull } from './rows.ts';

/** Cache schema. Files stay the source of truth; this number only versions the cache. */
export const INDEX_SCHEMA_VERSION = 2;

export const INDEX_FILE_NAME = 'index.sqlite';

export const INDEX_RELATIVE_PATH = `${GAVETA_DIRECTORY}/${INDEX_FILE_NAME}`;

/**
 * Case- and accent-insensitive key for titles and aliases.
 * NFD, drop combining marks, then lowercase. Spaces stay so distinct titles do not collapse.
 */
export function foldMatchKey(value: string): string {
  let folded = '';
  for (const char of value.normalize('NFD')) {
    if (isCombiningMark(char)) {
      continue;
    }
    folded += char.toLowerCase();
  }
  return folded;
}

const COMBINING_MARK = /\p{M}/u;

function isCombiningMark(char: string): boolean {
  return COMBINING_MARK.test(char);
}

const SCHEMA_V1 = [
  `CREATE TABLE notes (
    path TEXT PRIMARY KEY,
    id TEXT,
    title TEXT NOT NULL,
    type TEXT,
    created TEXT,
    updated TEXT,
    tags TEXT NOT NULL,
    plain_text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    mtime_ms INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE aliases (
    path TEXT NOT NULL,
    alias TEXT NOT NULL,
    PRIMARY KEY (path, alias),
    FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE links (
    path TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    href TEXT,
    target_id TEXT,
    pending_title TEXT,
    rel TEXT,
    section_id TEXT,
    ghost INTEGER NOT NULL,
    wikilink_title TEXT,
    wikilink_section TEXT,
    wikilink_label TEXT,
    PRIMARY KEY (path, ordinal),
    FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE sections (
    path TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    section_id TEXT,
    heading TEXT,
    level INTEGER,
    plain_text TEXT NOT NULL,
    parent_ordinal INTEGER,
    PRIMARY KEY (path, ordinal),
    FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE tasks (
    path TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    task_id TEXT,
    text TEXT NOT NULL,
    checked INTEGER NOT NULL,
    due TEXT,
    priority TEXT,
    section_id TEXT,
    PRIMARY KEY (path, ordinal),
    FOREIGN KEY (path) REFERENCES notes(path) ON DELETE CASCADE
  ) STRICT`,
  `CREATE TABLE problems (
    path TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    hint TEXT NOT NULL,
    details TEXT,
    PRIMARY KEY (path, ordinal)
  ) STRICT`,
  'CREATE INDEX notes_id ON notes(id)',
  'CREATE INDEX links_target_id ON links(target_id)',
  'CREATE INDEX aliases_alias ON aliases(alias)',
] as const;

// FTS5 tokenize arguments are SQL string literals. Double quotes are identifiers
// because node:sqlite leaves double-quoted string literals disabled.
const SCHEMA_V2 = [
  "ALTER TABLE notes ADD COLUMN title_folded TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE aliases ADD COLUMN alias_folded TEXT NOT NULL DEFAULT ''",
  'CREATE INDEX notes_title_folded ON notes(title_folded)',
  'CREATE INDEX aliases_alias_folded ON aliases(alias_folded)',
  `CREATE VIRTUAL TABLE fts USING fts5(
    path UNINDEXED,
    title,
    aliases,
    headings,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
  )`,
] as const;

export const INSERT_NOTE = `INSERT INTO notes (
  path, id, title, title_folded, type, created, updated, tags, plain_text, content_hash, mtime_ms, size_bytes
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const INSERT_ALIAS = 'INSERT INTO aliases (path, alias, alias_folded) VALUES (?, ?, ?)';

export const INSERT_LINK = `INSERT INTO links (
  path, ordinal, kind, text, href, target_id, pending_title, rel, section_id, ghost,
  wikilink_title, wikilink_section, wikilink_label
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const INSERT_SECTION = `INSERT INTO sections (
  path, ordinal, section_id, heading, level, plain_text, parent_ordinal
) VALUES (?, ?, ?, ?, ?, ?, ?)`;

export const INSERT_TASK = `INSERT INTO tasks (
  path, ordinal, task_id, text, checked, due, priority, section_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

export const INSERT_PROBLEM =
  'INSERT INTO problems (path, ordinal, code, message, hint, details) VALUES (?, ?, ?, ?, ?, ?)';

export const INSERT_FTS =
  'INSERT INTO fts (path, title, aliases, headings, body) VALUES (?, ?, ?, ?, ?)';

export const DELETE_PATH_CONTENT = [
  'DELETE FROM problems WHERE path = ?',
  'DELETE FROM fts WHERE path = ?',
  'DELETE FROM tasks WHERE path = ?',
  'DELETE FROM sections WHERE path = ?',
  'DELETE FROM links WHERE path = ?',
  'DELETE FROM aliases WHERE path = ?',
  'DELETE FROM notes WHERE path = ?',
] as const;

export const CLEAR_CONTENT = `DELETE FROM problems;
DELETE FROM fts;
DELETE FROM tasks;
DELETE FROM sections;
DELETE FROM links;
DELETE FROM aliases;
DELETE FROM notes;`;

export const SELECT_NOTES = `SELECT path, id, title, title_folded, type, created, updated, tags, plain_text,
  content_hash, mtime_ms, size_bytes
  FROM notes ORDER BY path`;

export const SELECT_NOTE = `SELECT path, id, title, title_folded, type, created, updated, tags, plain_text,
  content_hash, mtime_ms, size_bytes
  FROM notes WHERE path = ?`;

export const SELECT_NOTES_FOR_ID = `SELECT path, id, title, title_folded, type, created, updated, tags, plain_text,
  content_hash, mtime_ms, size_bytes
  FROM notes WHERE id = ? ORDER BY path`;

export const SELECT_ALIASES = 'SELECT path, alias, alias_folded FROM aliases ORDER BY path, alias';

export const SELECT_ALIASES_FOR_PATH =
  'SELECT path, alias, alias_folded FROM aliases WHERE path = ? ORDER BY alias';

export const SELECT_LINKS = `SELECT path, ordinal, kind, text, href, target_id, pending_title, rel, section_id,
  ghost, wikilink_title, wikilink_section, wikilink_label
  FROM links ORDER BY path, ordinal`;

export const SELECT_LINKS_FOR_PATH = `SELECT path, ordinal, kind, text, href, target_id, pending_title, rel,
  section_id, ghost, wikilink_title, wikilink_section, wikilink_label
  FROM links WHERE path = ? ORDER BY ordinal`;

export const SELECT_SECTIONS_FOR_PATH = `SELECT path, ordinal, section_id, heading, level, plain_text, parent_ordinal
  FROM sections WHERE path = ? ORDER BY ordinal`;

export const SELECT_TASKS = `SELECT path, ordinal, task_id, text, checked, due, priority, section_id
  FROM tasks ORDER BY path, ordinal`;

export const SELECT_TASKS_FOR_PATH = `SELECT path, ordinal, task_id, text, checked, due, priority, section_id
  FROM tasks WHERE path = ? ORDER BY ordinal`;

export const SELECT_PROBLEMS =
  'SELECT path, ordinal, code, message, hint, details FROM problems ORDER BY path, ordinal';

export const SELECT_DUPLICATE_IDS = `SELECT id FROM notes
  WHERE id IS NOT NULL
  GROUP BY id
  HAVING COUNT(*) > 1
  ORDER BY id`;

export const SELECT_PATHS_FOR_ID = 'SELECT path FROM notes WHERE id = ? ORDER BY path';

export const SEARCH = `SELECT
  notes.path AS path,
  notes.id AS id,
  notes.title AS title,
  notes.type AS type,
  notes.tags AS tags,
  snippet(fts, 1, '<mark>', '</mark>', '…', 12) AS title_snippet,
  snippet(fts, 2, '<mark>', '</mark>', '…', 12) AS alias_snippet,
  snippet(fts, 3, '<mark>', '</mark>', '…', 12) AS heading_snippet,
  snippet(fts, 4, '<mark>', '</mark>', '…', 12) AS body_snippet,
  bm25(fts) AS rank
FROM fts
JOIN notes ON notes.path = fts.path
WHERE fts MATCH ?
  AND (? IS NULL OR notes.type = ?)
  AND (? IS NULL OR EXISTS (
    SELECT 1 FROM json_each(notes.tags) WHERE json_each.value = ?
  ))
ORDER BY rank, notes.path
LIMIT ?`;

/** Statements applied for one schema version. Tests build a v1 database from version 1. */
export function schemaStatements(version: 1 | 2): readonly string[] {
  if (version === 1) {
    return SCHEMA_V1;
  }
  return SCHEMA_V2;
}

export function readSchemaVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get();
  if (row === undefined) {
    return 0;
  }
  const value = row.user_version;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return -1;
  }
  return value;
}

export function tableCount(database: DatabaseSync): number {
  const row = database
    .prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .get();
  if (row === undefined || typeof row.n !== 'number') {
    return -1;
  }
  return row.n;
}

export function quickCheckOk(database: DatabaseSync): boolean {
  const rows = database.prepare('PRAGMA quick_check').all();
  return rows.length === 1 && rows[0]?.quick_check === 'ok';
}

/**
 * Apply pending migrations up to `target`. Version 0 is an empty file.
 * A database that already has tables at version 0 is not ours.
 */
export function migrateDatabase(
  database: DatabaseSync,
  target: number = INDEX_SCHEMA_VERSION,
): void {
  if (!Number.isInteger(target) || target < 1 || target > INDEX_SCHEMA_VERSION) {
    throw new Error('schema target is out of range');
  }
  let version = readSchemaVersion(database);
  if (version < 0) {
    throw new Error('schema version is unreadable');
  }
  if (version === 0 && tableCount(database) > 0) {
    throw new Error('sqlite file is not a gaveta index');
  }
  if (version > target) {
    throw new Error('schema version is newer than this build');
  }
  if (version < 1 && target >= 1) {
    applyStatements(database, SCHEMA_V1, 1);
    version = 1;
  }
  if (version < 2 && target >= 2) {
    applyVersion2(database);
  }
}

function applyStatements(
  database: DatabaseSync,
  statements: readonly string[],
  version: 1 | 2,
): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const statement of statements) {
      database.exec(statement);
    }
    setSchemaVersion(database, version);
    database.exec('COMMIT');
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function applyVersion2(database: DatabaseSync): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const statement of SCHEMA_V2) {
      database.exec(statement);
    }
    backfillFoldAndFts(database);
    setSchemaVersion(database, 2);
    database.exec('COMMIT');
  } catch (error) {
    rollback(database);
    throw error;
  }
}

function setSchemaVersion(database: DatabaseSync, version: 1 | 2): void {
  if (version === 1) {
    database.exec('PRAGMA user_version = 1');
    return;
  }
  database.exec('PRAGMA user_version = 2');
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK');
  } catch {
    // Already outside a transaction, or the connection is unusable.
  }
}

function backfillFoldAndFts(database: DatabaseSync): void {
  const updateNote = database.prepare('UPDATE notes SET title_folded = ? WHERE path = ?');
  const updateAlias = database.prepare(
    'UPDATE aliases SET alias_folded = ? WHERE path = ? AND alias = ?',
  );
  const insertFts = database.prepare(INSERT_FTS);
  const aliases = new Map<string, string[]>();
  for (const row of database
    .prepare('SELECT path, alias FROM aliases ORDER BY path, alias')
    .all()) {
    const path = cellText(row, 'path');
    const alias = cellText(row, 'alias');
    updateAlias.run(foldMatchKey(alias), path, alias);
    const list = aliases.get(path);
    if (list === undefined) {
      aliases.set(path, [alias]);
    } else {
      list.push(alias);
    }
  }
  const headings = new Map<string, string[]>();
  for (const row of database
    .prepare('SELECT path, heading FROM sections WHERE heading IS NOT NULL ORDER BY path, ordinal')
    .all()) {
    const path = cellText(row, 'path');
    const heading = cellTextOrNull(row, 'heading');
    if (heading === null || heading.length === 0) {
      continue;
    }
    const list = headings.get(path);
    if (list === undefined) {
      headings.set(path, [heading]);
    } else {
      list.push(heading);
    }
  }
  for (const row of database
    .prepare('SELECT path, title, plain_text FROM notes ORDER BY path')
    .all()) {
    const path = cellText(row, 'path');
    const title = cellText(row, 'title');
    const plainText = cellText(row, 'plain_text');
    updateNote.run(foldMatchKey(title), path);
    const aliasText = aliases.get(path)?.join('\n') ?? '';
    const headingText = headings.get(path)?.join('\n') ?? '';
    insertFts.run(path, title, aliasText, headingText, plainText);
  }
}

export function configureDatabase(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('PRAGMA journal_mode = WAL');
}
