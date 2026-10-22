import './warning.ts';
import { createHash } from 'node:crypto';
import { constants, rmSync } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync, type SQLOutputValue, type StatementSync } from 'node:sqlite';
import { isNoteType, type NoteType } from '../contract.ts';
import { formatDiagnostic, GavetaError, isDiagnosticCode, type DiagnosticCode } from '../errors.ts';
import {
  parseNote,
  type NoteLinkKind,
  type NoteModel,
  type NoteSection,
  type ParseResult,
} from '../parser.ts';
import { GAVETA_DIRECTORY } from '../vault/constants.ts';
import { pathOutsideVault, vaultNotFound } from '../vault/errors.ts';
import { hasNodeErrorCode, nodeErrorCode } from '../vault/node-error.ts';
import { isInsideVault, readVaultText, resolveInsideVault } from '../vault/paths.ts';
import { scanNoteFiles, type ScannedFile } from './scan.ts';
import {
  CLEAR_CONTENT,
  configureDatabase,
  DELETE_PATH_CONTENT,
  foldMatchKey,
  INDEX_FILE_NAME,
  INDEX_RELATIVE_PATH,
  INDEX_SCHEMA_VERSION,
  INSERT_ALIAS,
  INSERT_FTS,
  INSERT_LINK,
  INSERT_NOTE,
  INSERT_PROBLEM,
  INSERT_SECTION,
  INSERT_TASK,
  migrateDatabase,
  quickCheckOk,
  readSchemaVersion,
  SEARCH,
  SELECT_ALIASES,
  SELECT_ALIASES_FOR_PATH,
  SELECT_DUPLICATE_IDS,
  SELECT_LINKS,
  SELECT_LINKS_FOR_PATH,
  SELECT_NOTE,
  SELECT_NOTES,
  SELECT_NOTES_FOR_ID,
  SELECT_PATHS_FOR_ID,
  SELECT_PROBLEMS,
  SELECT_SECTIONS_FOR_PATH,
  SELECT_TASKS,
  SELECT_TASKS_FOR_PATH,
  tableCount,
} from './schema.ts';
import { cellNumber, cellNumberOrNull, cellText, cellTextOrNull } from './rows.ts';
import { silenceSqliteExperimentalWarning } from './warning.ts';

/** Highlight markers wrapped around each FTS snippet. */
export const SEARCH_SNIPPET_START = '<mark>';
export const SEARCH_SNIPPET_END = '</mark>';

export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 100;

export { INDEX_RELATIVE_PATH, INDEX_SCHEMA_VERSION, foldMatchKey };

const SQLITE_CORRUPT = 11;
const SQLITE_NOTADB = 26;

const LINK_KINDS: ReadonlySet<string> = new Set([
  'canonical',
  'pending',
  'wikilink',
  'external',
  'relative',
]);

export interface IndexProblem {
  readonly path: string;
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly hint: string;
  readonly details: Readonly<Record<string, string | number>> | null;
}

export interface DuplicateId {
  readonly id: string;
  readonly paths: readonly string[];
}

export interface ReindexReport {
  readonly written: number;
  readonly removed: number;
  readonly problems: readonly IndexProblem[];
  readonly duplicates: readonly DuplicateId[];
}

export interface IndexedNote {
  readonly path: string;
  readonly id: string | null;
  readonly title: string;
  readonly titleFolded: string;
  readonly type: NoteType | null;
  readonly created: string | null;
  readonly updated: string | null;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly plainText: string;
  readonly contentHash: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

export interface IndexedAlias {
  readonly path: string;
  readonly alias: string;
  readonly aliasFolded: string;
}

export interface IndexedLink {
  readonly path: string;
  readonly ordinal: number;
  readonly kind: NoteLinkKind;
  readonly text: string;
  readonly href: string | null;
  readonly targetId: string | null;
  readonly pendingTitle: string | null;
  readonly rel: string | null;
  readonly sectionId: string | null;
  readonly ghost: boolean;
  readonly wikilinkTitle: string | null;
  readonly wikilinkSection: string | null;
  readonly wikilinkLabel: string | null;
}

export interface IndexedSection {
  readonly path: string;
  readonly ordinal: number;
  readonly sectionId: string | null;
  readonly heading: string | null;
  readonly level: number | null;
  readonly plainText: string;
  readonly parentOrdinal: number | null;
}

export interface IndexedTask {
  readonly path: string;
  readonly ordinal: number;
  readonly taskId: string | null;
  readonly text: string;
  readonly checked: boolean;
  readonly due: string | null;
  readonly priority: string | null;
  readonly sectionId: string | null;
}

export interface SearchHit {
  readonly path: string;
  readonly id: string | null;
  readonly title: string;
  readonly type: NoteType | null;
  readonly tags: readonly string[];
  readonly snippet: string;
  readonly rank: number;
}

export interface SearchOptions {
  readonly type?: NoteType;
  readonly tag?: string;
  readonly limit?: number;
}

interface LoadedNote {
  readonly path: string;
  readonly missing: boolean;
  readonly note: NoteModel | null;
  readonly problems: readonly IndexProblem[];
  readonly hash: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

interface FlatSection {
  readonly ordinal: number;
  readonly parentOrdinal: number | null;
  readonly sectionId: string | null;
  readonly heading: string | null;
  readonly level: number | null;
  readonly plainText: string;
}

interface Statements {
  readonly insertNote: StatementSync;
  readonly insertAlias: StatementSync;
  readonly insertLink: StatementSync;
  readonly insertSection: StatementSync;
  readonly insertTask: StatementSync;
  readonly insertProblem: StatementSync;
  readonly insertFts: StatementSync;
  readonly deletePath: readonly StatementSync[];
  readonly notes: StatementSync;
  readonly note: StatementSync;
  readonly notesForId: StatementSync;
  readonly aliases: StatementSync;
  readonly aliasesForPath: StatementSync;
  readonly links: StatementSync;
  readonly linksForPath: StatementSync;
  readonly sectionsForPath: StatementSync;
  readonly tasks: StatementSync;
  readonly tasksForPath: StatementSync;
  readonly problems: StatementSync;
  readonly duplicateIds: StatementSync;
  readonly pathsForId: StatementSync;
  readonly search: StatementSync;
}

type NoteRow = Record<string, SQLOutputValue>;

/**
 * Open the vault cache at `.gaveta/index.sqlite`.
 * A missing file is created. A corrupt or newer-than-this-build file is replaced;
 * note HTML is never modified.
 */
export async function openVaultIndex(vaultRoot: string): Promise<VaultIndex> {
  return VaultIndex.open(vaultRoot);
}

export class VaultIndex {
  private closed = false;
  private readonly statements: Statements;
  private readonly database: DatabaseSync;
  private readonly root: string;
  private readonly filePath: string;
  private readonly recovered: IndexProblem | null;

  static async open(vaultRoot: string): Promise<VaultIndex> {
    if (typeof vaultRoot !== 'string') {
      throw new GavetaError('E_ARG_INVALID');
    }
    const located = await locateIndex(vaultRoot);
    const opened = openDatabase(located.file);
    return new VaultIndex(opened.database, located.root, located.file, opened.recovery);
  }

  // Parameter properties are rejected by Node's type stripper, which the CLI uses.
  private constructor(
    database: DatabaseSync,
    root: string,
    filePath: string,
    recovered: IndexProblem | null,
  ) {
    this.database = database;
    this.root = root;
    this.filePath = filePath;
    this.recovered = recovered;
    this.statements = prepareStatements(database);
  }

  get location(): string {
    return this.filePath;
  }

  get schemaVersion(): number {
    this.assertOpen();
    return readSchemaVersion(this.database);
  }

  recovery(): IndexProblem | null {
    return this.recovered;
  }

  async rebuild(): Promise<ReindexReport> {
    this.assertOpen();
    const scanned = await scanNoteFiles(this.root);
    const loaded: LoadedNote[] = [];
    for (const file of scanned.files) {
      loaded.push(await this.loadPath(file.relativePath, file));
    }
    let written = 0;
    this.transaction(() => {
      this.database.exec(CLEAR_CONTENT);
      const seen = new Set<string>();
      for (const file of loaded) {
        if (file.missing) {
          continue;
        }
        written += this.writeLoaded(file, false);
        seen.add(file.path);
      }
      for (const problem of scanned.problems) {
        if (seen.has(problem.path)) {
          continue;
        }
        this.statements.insertProblem.run(
          problem.path,
          0,
          problem.code,
          problem.message,
          problem.hint,
          encodeDetails(problem.details),
        );
      }
    });
    return this.report(written, 0);
  }

  async upsert(userPath: string): Promise<ReindexReport> {
    this.assertOpen();
    const notePath = await normalizeNotePath(this.root, userPath);
    const loaded = await this.loadPath(notePath, null);
    if (loaded.missing) {
      throw new GavetaError('E_REF_NOT_FOUND');
    }
    let written = 0;
    this.transaction(() => {
      written = this.writeLoaded(loaded, true);
    });
    return this.report(written, 0);
  }

  async remove(userPath: string): Promise<ReindexReport> {
    this.assertOpen();
    const notePath = await normalizeNotePath(this.root, userPath);
    let removed = 0;
    this.transaction(() => {
      removed = this.deletePath(notePath) ? 1 : 0;
    });
    return this.report(0, removed);
  }

  search(query: string, options?: SearchOptions): SearchHit[] {
    this.assertOpen();
    const normalized = normalizeSearch(query, options);
    let rows: NoteRow[];
    try {
      rows = this.statements.search.all(
        normalized.query,
        normalized.type,
        normalized.type,
        normalized.tag,
        normalized.tag,
        normalized.limit,
      );
    } catch (error) {
      if (sqliteErrcode(error) === 1) {
        throw new GavetaError('E_ARG_INVALID');
      }
      throw error;
    }
    const hits: SearchHit[] = [];
    for (const row of rows) {
      hits.push(mapHit(row));
    }
    return hits;
  }

  notes(): IndexedNote[] {
    this.assertOpen();
    const aliases = this.aliasesByPath();
    const notes: IndexedNote[] = [];
    for (const row of this.statements.notes.all()) {
      const notePath = cellText(row, 'path');
      notes.push(mapNote(row, aliases.get(notePath) ?? []));
    }
    return notes;
  }

  note(notePath: string): IndexedNote | null {
    this.assertOpen();
    const row = this.statements.note.get(notePath);
    if (row === undefined) {
      return null;
    }
    return mapNote(row, this.aliasList(notePath));
  }

  /** Every note with this id, in path order. Duplicates are all returned. */
  notesById(id: string): IndexedNote[] {
    this.assertOpen();
    if (typeof id !== 'string' || id.length === 0) {
      throw new GavetaError('E_ARG_INVALID');
    }
    const notes: IndexedNote[] = [];
    for (const row of this.statements.notesForId.all(id)) {
      notes.push(mapNote(row, this.aliasList(cellText(row, 'path'))));
    }
    return notes;
  }

  aliases(notePath?: string): IndexedAlias[] {
    this.assertOpen();
    const rows =
      notePath === undefined
        ? this.statements.aliases.all()
        : this.statements.aliasesForPath.all(notePath);
    const aliases: IndexedAlias[] = [];
    for (const row of rows) {
      aliases.push({
        path: cellText(row, 'path'),
        alias: cellText(row, 'alias'),
        aliasFolded: cellText(row, 'alias_folded'),
      });
    }
    return aliases;
  }

  links(notePath?: string): IndexedLink[] {
    this.assertOpen();
    const rows =
      notePath === undefined
        ? this.statements.links.all()
        : this.statements.linksForPath.all(notePath);
    return rows.map((row) => mapLink(row));
  }

  sections(notePath: string): IndexedSection[] {
    this.assertOpen();
    const sections: IndexedSection[] = [];
    for (const row of this.statements.sectionsForPath.all(notePath)) {
      sections.push({
        path: cellText(row, 'path'),
        ordinal: cellNumber(row, 'ordinal'),
        sectionId: cellTextOrNull(row, 'section_id'),
        heading: cellTextOrNull(row, 'heading'),
        level: cellNumberOrNull(row, 'level'),
        plainText: cellText(row, 'plain_text'),
        parentOrdinal: cellNumberOrNull(row, 'parent_ordinal'),
      });
    }
    return sections;
  }

  tasks(notePath?: string): IndexedTask[] {
    this.assertOpen();
    const rows =
      notePath === undefined
        ? this.statements.tasks.all()
        : this.statements.tasksForPath.all(notePath);
    const tasks: IndexedTask[] = [];
    for (const row of rows) {
      tasks.push({
        path: cellText(row, 'path'),
        ordinal: cellNumber(row, 'ordinal'),
        taskId: cellTextOrNull(row, 'task_id'),
        text: cellText(row, 'text'),
        checked: cellFlag(row, 'checked'),
        due: cellTextOrNull(row, 'due'),
        priority: cellTextOrNull(row, 'priority'),
        sectionId: cellTextOrNull(row, 'section_id'),
      });
    }
    return tasks;
  }

  problems(): IndexProblem[] {
    this.assertOpen();
    const problems: IndexProblem[] = [];
    for (const row of this.statements.problems.all()) {
      const code = cellText(row, 'code');
      if (!isDiagnosticCode(code)) {
        throw new GavetaError('E_INDEX_CORRUPT');
      }
      problems.push({
        path: cellText(row, 'path'),
        code,
        message: cellText(row, 'message'),
        hint: cellText(row, 'hint'),
        details: decodeDetails(cellTextOrNull(row, 'details')),
      });
    }
    return problems.concat(this.duplicateProblems());
  }

  duplicates(): DuplicateId[] {
    this.assertOpen();
    const duplicates: DuplicateId[] = [];
    for (const row of this.statements.duplicateIds.all()) {
      const id = cellText(row, 'id');
      const paths: string[] = [];
      for (const pathRow of this.statements.pathsForId.all(id)) {
        paths.push(cellText(pathRow, 'path'));
      }
      duplicates.push({ id, paths });
    }
    return duplicates;
  }

  /**
   * REQ-VAULT-07: a repeated id stays on every note and is reported as `E_ID_DUPLICATE`.
   * Computed from the notes table so an incremental upsert cannot leave a stale copy.
   */
  private duplicateProblems(): IndexProblem[] {
    const text = formatDiagnostic('E_ID_DUPLICATE');
    const problems: IndexProblem[] = [];
    for (const duplicate of this.duplicates()) {
      for (const notePath of duplicate.paths) {
        problems.push({
          path: notePath,
          code: 'E_ID_DUPLICATE',
          message: text.message,
          hint: text.hint,
          details: { id: duplicate.id },
        });
      }
    }
    return problems;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.database.close();
  }

  private report(written: number, removed: number): ReindexReport {
    return {
      written,
      removed,
      problems: this.problems(),
      duplicates: this.duplicates(),
    };
  }

  private async loadPath(notePath: string, scanned: ScannedFile | null): Promise<LoadedNote> {
    try {
      const absolute = scanned?.absolutePath ?? (await resolveInsideVault(this.root, notePath));
      const listed = await lstat(absolute);
      if (listed.isSymbolicLink() || scanned?.symlink === true) {
        const target = await realpath(absolute);
        if (!isInsideVault(this.root, target)) {
          throw pathOutsideVault();
        }
        const info = await stat(target);
        const text = await readVaultText(this.root, notePath);
        return parseLoaded(notePath, text, Math.round(info.mtimeMs));
      }
      if (!listed.isFile()) {
        throw pathOutsideVault();
      }
      const text = await readRegularFile(absolute);
      return parseLoaded(notePath, text, Math.round(listed.mtimeMs));
    } catch (error) {
      return loadFailure(notePath, error);
    }
  }

  private writeLoaded(loaded: LoadedNote, replace: boolean): number {
    if (replace) {
      this.deletePath(loaded.path);
    }
    let ordinal = 0;
    for (const problem of loaded.problems) {
      this.statements.insertProblem.run(
        loaded.path,
        ordinal,
        problem.code,
        problem.message,
        problem.hint,
        encodeDetails(problem.details),
      );
      ordinal += 1;
    }
    const note = loaded.note;
    if (note === null) {
      return 0;
    }
    const aliases = uniqueStrings(note.metadata.aliases);
    const title = note.title ?? '';
    this.statements.insertNote.run(
      loaded.path,
      note.id,
      title,
      foldMatchKey(title),
      note.type,
      note.metadata.created,
      note.metadata.updated,
      JSON.stringify(note.metadata.tags),
      note.plainText,
      loaded.hash,
      loaded.mtimeMs,
      loaded.sizeBytes,
    );
    for (const alias of aliases) {
      this.statements.insertAlias.run(loaded.path, alias, foldMatchKey(alias));
    }
    for (let index = 0; index < note.links.length; index += 1) {
      const link = note.links[index];
      if (link === undefined) {
        continue;
      }
      this.statements.insertLink.run(
        loaded.path,
        index,
        link.kind,
        link.text,
        link.href,
        link.targetId,
        link.pendingTitle,
        link.rel,
        link.sectionId,
        link.ghost ? 1 : 0,
        link.wikilink?.title ?? null,
        link.wikilink?.section ?? null,
        link.wikilink?.label ?? null,
      );
    }
    const sections: FlatSection[] = [];
    flattenSections(note.sections, null, sections);
    for (const section of sections) {
      this.statements.insertSection.run(
        loaded.path,
        section.ordinal,
        section.sectionId,
        section.heading,
        section.level,
        section.plainText,
        section.parentOrdinal,
      );
    }
    for (let index = 0; index < note.tasks.length; index += 1) {
      const task = note.tasks[index];
      if (task === undefined) {
        continue;
      }
      this.statements.insertTask.run(
        loaded.path,
        index,
        task.id,
        task.text,
        task.checked ? 1 : 0,
        task.due,
        task.priority,
        task.sectionId,
      );
    }
    const headings: string[] = [];
    for (const heading of note.headings) {
      if (heading.text.length > 0) {
        headings.push(heading.text);
      }
    }
    this.statements.insertFts.run(
      loaded.path,
      title,
      aliases.join('\n'),
      headings.join('\n'),
      note.plainText,
    );
    return 1;
  }

  private deletePath(notePath: string): boolean {
    const existing = this.statements.note.get(notePath);
    for (const statement of this.statements.deletePath) {
      statement.run(notePath);
    }
    return existing !== undefined;
  }

  private aliasList(notePath: string): string[] {
    const aliases: string[] = [];
    for (const row of this.statements.aliasesForPath.all(notePath)) {
      aliases.push(cellText(row, 'alias'));
    }
    return aliases;
  }

  private aliasesByPath(): Map<string, string[]> {
    const aliases = new Map<string, string[]>();
    for (const row of this.statements.aliases.all()) {
      const notePath = cellText(row, 'path');
      const alias = cellText(row, 'alias');
      const list = aliases.get(notePath);
      if (list === undefined) {
        aliases.set(notePath, [alias]);
      } else {
        list.push(alias);
      }
    }
    return aliases;
  }

  private transaction(run: () => void): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      run();
      this.database.exec('COMMIT');
    } catch (error) {
      rollback(this.database);
      throw error;
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('The vault index is closed.');
    }
  }
}

function prepareStatements(database: DatabaseSync): Statements {
  return {
    insertNote: database.prepare(INSERT_NOTE),
    insertAlias: database.prepare(INSERT_ALIAS),
    insertLink: database.prepare(INSERT_LINK),
    insertSection: database.prepare(INSERT_SECTION),
    insertTask: database.prepare(INSERT_TASK),
    insertProblem: database.prepare(INSERT_PROBLEM),
    insertFts: database.prepare(INSERT_FTS),
    deletePath: DELETE_PATH_CONTENT.map((sql) => database.prepare(sql)),
    notes: database.prepare(SELECT_NOTES),
    note: database.prepare(SELECT_NOTE),
    notesForId: database.prepare(SELECT_NOTES_FOR_ID),
    aliases: database.prepare(SELECT_ALIASES),
    aliasesForPath: database.prepare(SELECT_ALIASES_FOR_PATH),
    links: database.prepare(SELECT_LINKS),
    linksForPath: database.prepare(SELECT_LINKS_FOR_PATH),
    sectionsForPath: database.prepare(SELECT_SECTIONS_FOR_PATH),
    tasks: database.prepare(SELECT_TASKS),
    tasksForPath: database.prepare(SELECT_TASKS_FOR_PATH),
    problems: database.prepare(SELECT_PROBLEMS),
    duplicateIds: database.prepare(SELECT_DUPLICATE_IDS),
    pathsForId: database.prepare(SELECT_PATHS_FOR_ID),
    search: database.prepare(SEARCH),
  };
}

async function locateIndex(vaultRoot: string): Promise<{ root: string; file: string }> {
  if (!isSafePathInput(vaultRoot)) {
    throw pathOutsideVault();
  }
  let root: string;
  try {
    root = await realpath(vaultRoot);
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ENOTDIR') ||
      hasNodeErrorCode(error, 'ELOOP')
    ) {
      throw vaultNotFound();
    }
    throw error;
  }
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw vaultNotFound();
  }
  const gaveta = path.join(root, GAVETA_DIRECTORY);
  let listed;
  try {
    listed = await lstat(gaveta);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      throw vaultNotFound();
    }
    throw error;
  }
  if (listed.isSymbolicLink()) {
    throw pathOutsideVault();
  }
  if (!listed.isDirectory()) {
    throw vaultNotFound();
  }
  const file = path.join(gaveta, INDEX_FILE_NAME);
  if (!isInsideVault(root, file)) {
    throw pathOutsideVault();
  }
  let fileStat;
  try {
    fileStat = await lstat(file);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return { root, file };
    }
    throw error;
  }
  if (fileStat.isSymbolicLink()) {
    throw pathOutsideVault();
  }
  if (!fileStat.isFile()) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return { root, file };
}

function openDatabase(file: string): { database: DatabaseSync; recovery: IndexProblem | null } {
  let database: DatabaseSync;
  try {
    database = createDatabase(file);
  } catch (error) {
    if (isRecoverableSqlite(error)) {
      return recoverDatabase(file, 'corrupt');
    }
    if (isSqliteError(error)) {
      throw new GavetaError('E_INDEX_CORRUPT');
    }
    throw error;
  }
  try {
    configureDatabase(database);
    const version = readSchemaVersion(database);
    if (!quickCheckOk(database)) {
      database.close();
      return recoverDatabase(file, 'corrupt');
    }
    if (version > INDEX_SCHEMA_VERSION || (version === 0 && tableCount(database) > 0)) {
      database.close();
      return recoverDatabase(file, 'schema');
    }
    migrateDatabase(database);
    return { database, recovery: null };
  } catch (error) {
    closeQuietly(database);
    if (error instanceof GavetaError) {
      throw error;
    }
    if (isRecoverableSqlite(error)) {
      return recoverDatabase(file, 'corrupt');
    }
    if (isSqliteError(error)) {
      throw new GavetaError('E_INDEX_CORRUPT');
    }
    return recoverDatabase(file, 'schema');
  }
}

function recoverDatabase(
  file: string,
  reason: 'corrupt' | 'schema',
): { database: DatabaseSync; recovery: IndexProblem } {
  removeDatabaseFiles(file);
  let database: DatabaseSync | undefined;
  try {
    database = createDatabase(file);
    configureDatabase(database);
    migrateDatabase(database);
    return { database, recovery: recoveryProblem(reason) };
  } catch {
    if (database !== undefined) {
      closeQuietly(database);
    }
    throw new GavetaError('E_INDEX_CORRUPT');
  }
}

function createDatabase(file: string): DatabaseSync {
  silenceSqliteExperimentalWarning();
  return new DatabaseSync(file, {
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
  });
}

function removeDatabaseFiles(file: string): void {
  rmSync(file, { force: true });
  rmSync(`${file}-wal`, { force: true });
  rmSync(`${file}-shm`, { force: true });
}

function recoveryProblem(reason: 'corrupt' | 'schema'): IndexProblem {
  const text = formatDiagnostic('W_INDEX_RECOVERED');
  return {
    path: INDEX_RELATIVE_PATH,
    code: 'W_INDEX_RECOVERED',
    message: text.message,
    hint: text.hint,
    details: { reason },
  };
}

function closeQuietly(database: DatabaseSync): void {
  try {
    database.close();
  } catch {
    // The handle may already be closed after a failed pragma.
  }
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK');
  } catch {
    // The connection is already outside a transaction.
  }
}

async function normalizeNotePath(root: string, userPath: string): Promise<string> {
  if (typeof userPath !== 'string' || !isSafePathInput(userPath)) {
    throw pathOutsideVault();
  }
  const absolute = await resolveInsideVault(root, userPath);
  const relativePath = path.relative(root, absolute);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw pathOutsideVault();
  }
  const posixPath = relativePath.split(path.sep).join('/');
  if (posixPath === GAVETA_DIRECTORY || posixPath.startsWith(`${GAVETA_DIRECTORY}/`)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return posixPath;
}

async function readRegularFile(absolute: string): Promise<string> {
  let handle;
  try {
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ELOOP') || hasNodeErrorCode(error, 'EISDIR')) {
      throw pathOutsideVault();
    }
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw pathOutsideVault();
    }
    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

function parseLoaded(notePath: string, text: string, mtimeMs: number): LoadedNote {
  const hash = contentHash(text);
  const sizeBytes = Buffer.byteLength(text, 'utf8');
  let parsed: ParseResult;
  try {
    parsed = parseNote(text);
  } catch {
    const diagnostic = formatDiagnostic('E_HTML_INVALID');
    return {
      path: notePath,
      missing: false,
      note: null,
      problems: [
        {
          path: notePath,
          code: 'E_HTML_INVALID',
          message: diagnostic.message,
          hint: diagnostic.hint,
          details: { reason: 'parse' },
        },
      ],
      hash,
      mtimeMs,
      sizeBytes,
    };
  }
  const problems: IndexProblem[] = [];
  for (const diagnostic of parsed.diagnostics) {
    problems.push({
      path: notePath,
      code: diagnostic.code,
      message: diagnostic.message,
      hint: diagnostic.hint,
      details: diagnostic.details,
    });
  }
  return {
    path: notePath,
    missing: false,
    note: parsed.note,
    problems,
    hash,
    mtimeMs,
    sizeBytes,
  };
}

function loadFailure(notePath: string, error: unknown): LoadedNote {
  if (hasNodeErrorCode(error, 'ENOENT')) {
    return {
      path: notePath,
      missing: true,
      note: null,
      problems: [],
      hash: '',
      mtimeMs: 0,
      sizeBytes: 0,
    };
  }
  if (error instanceof GavetaError) {
    if (error.code === 'E_VAULT_NOT_FOUND') {
      throw error;
    }
    return {
      path: notePath,
      missing: false,
      note: null,
      problems: [
        {
          path: notePath,
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: null,
        },
      ],
      hash: '',
      mtimeMs: 0,
      sizeBytes: 0,
    };
  }
  const diagnostic = formatDiagnostic('E_HTML_INVALID');
  const code = nodeErrorCode(error);
  return {
    path: notePath,
    missing: false,
    note: null,
    problems: [
      {
        path: notePath,
        code: 'E_HTML_INVALID',
        message: diagnostic.message,
        hint: diagnostic.hint,
        details: { reason: 'read', code: code ?? 'unknown' },
      },
    ],
    hash: '',
    mtimeMs: 0,
    sizeBytes: 0,
  };
}

function contentHash(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function flattenSections(
  sections: readonly NoteSection[],
  parent: number | null,
  out: FlatSection[],
): void {
  for (const section of sections) {
    const ordinal = out.length;
    out.push({
      ordinal,
      parentOrdinal: parent,
      sectionId: section.id,
      heading: section.heading?.text ?? null,
      level: section.heading?.level ?? null,
      plainText: section.plainText,
    });
    flattenSections(section.children, ordinal, out);
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function mapNote(row: NoteRow, aliases: readonly string[]): IndexedNote {
  return {
    path: cellText(row, 'path'),
    id: cellTextOrNull(row, 'id'),
    title: cellText(row, 'title'),
    titleFolded: cellText(row, 'title_folded'),
    type: noteType(cellTextOrNull(row, 'type')),
    created: cellTextOrNull(row, 'created'),
    updated: cellTextOrNull(row, 'updated'),
    tags: decodeTags(cellText(row, 'tags')),
    aliases,
    plainText: cellText(row, 'plain_text'),
    contentHash: cellText(row, 'content_hash'),
    mtimeMs: cellNumber(row, 'mtime_ms'),
    sizeBytes: cellNumber(row, 'size_bytes'),
  };
}

function mapLink(row: NoteRow): IndexedLink {
  const kind = cellText(row, 'kind');
  if (!isLinkKind(kind)) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return {
    path: cellText(row, 'path'),
    ordinal: cellNumber(row, 'ordinal'),
    kind,
    text: cellText(row, 'text'),
    href: cellTextOrNull(row, 'href'),
    targetId: cellTextOrNull(row, 'target_id'),
    pendingTitle: cellTextOrNull(row, 'pending_title'),
    rel: cellTextOrNull(row, 'rel'),
    sectionId: cellTextOrNull(row, 'section_id'),
    ghost: cellFlag(row, 'ghost'),
    wikilinkTitle: cellTextOrNull(row, 'wikilink_title'),
    wikilinkSection: cellTextOrNull(row, 'wikilink_section'),
    wikilinkLabel: cellTextOrNull(row, 'wikilink_label'),
  };
}

function mapHit(row: NoteRow): SearchHit {
  const titleSnippet = cellText(row, 'title_snippet');
  const aliasSnippet = cellText(row, 'alias_snippet');
  const headingSnippet = cellText(row, 'heading_snippet');
  const bodySnippet = cellText(row, 'body_snippet');
  return {
    path: cellText(row, 'path'),
    id: cellTextOrNull(row, 'id'),
    title: cellText(row, 'title'),
    type: noteType(cellTextOrNull(row, 'type')),
    tags: decodeTags(cellText(row, 'tags')),
    snippet: pickSnippet(bodySnippet, headingSnippet, titleSnippet, aliasSnippet),
    rank: cellNumber(row, 'rank'),
  };
}

function pickSnippet(body: string, heading: string, title: string, alias: string): string {
  for (const candidate of [body, heading, title, alias]) {
    if (candidate.includes(SEARCH_SNIPPET_START)) {
      return candidate;
    }
  }
  if (body.length > 0) {
    return body;
  }
  if (title.length > 0) {
    return title;
  }
  return heading.length > 0 ? heading : alias;
}

function noteType(value: string | null): NoteType | null {
  if (value === null) {
    return null;
  }
  if (!isNoteType(value)) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return value;
}

function isLinkKind(value: string): value is NoteLinkKind {
  return LINK_KINDS.has(value);
}

function cellFlag(row: NoteRow, key: string): boolean {
  const value = cellNumber(row, key);
  if (value !== 0 && value !== 1) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return value === 1;
}

function decodeTags(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  if (!isStringArray(parsed)) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return parsed;
}

function decodeDetails(value: string | null): Readonly<Record<string, string | number>> | null {
  if (value === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  if (!isDetailRecord(parsed)) {
    throw new GavetaError('E_INDEX_CORRUPT');
  }
  return parsed;
}

function encodeDetails(details: Readonly<Record<string, string | number>> | null): string | null {
  if (details === null) {
    return null;
  }
  return JSON.stringify(details);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isDetailRecord(value: unknown): value is Record<string, string | number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  for (const entry of Object.values(value)) {
    if (typeof entry !== 'string' && typeof entry !== 'number') {
      return false;
    }
  }
  return true;
}

function normalizeSearch(
  query: string,
  options: SearchOptions | undefined,
): { query: string; type: string | null; tag: string | null; limit: number } {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const type = options?.type ?? null;
  if (type !== null && !isNoteType(type)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const tag = options?.tag ?? null;
  if (tag !== null && tag.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const limit = options?.limit ?? SEARCH_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return { query: query.trim(), type, tag, limit };
}

function sqliteErrcode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('errcode' in error)) {
    return undefined;
  }
  const { errcode } = error;
  return typeof errcode === 'number' ? errcode : undefined;
}

function isRecoverableSqlite(error: unknown): boolean {
  const code = sqliteErrcode(error);
  return code === SQLITE_CORRUPT || code === SQLITE_NOTADB;
}

function isSqliteError(error: unknown): boolean {
  return hasNodeErrorCode(error, 'ERR_SQLITE_ERROR');
}

function isSafePathInput(value: string): boolean {
  return !value.includes('\0');
}
