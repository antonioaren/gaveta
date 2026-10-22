/** Package id. The SQLite index lands in a later phase-1 task. */
export const CORE_PACKAGE_ID = '@gaveta/core';

export {
  ALLOWED_ATTRIBUTES,
  BODY_ELEMENTS,
  COMPONENTS,
  CONTRACT_CLASSES,
  DATA_ATTRIBUTE_PREFIX,
  DOCUMENT_SHELL,
  FORBIDDEN_ELEMENTS,
  INLINE_STYLE_ATTRIBUTE,
  LINKS,
  NOTE_TYPES,
  NOTE_TYPE_STRUCTURES,
  REMOTE_RESOURCE_POLICY,
  SUGGESTED_REL,
  TASK_LIST,
  TASK_PRIORITIES,
  allocateSlug,
  attributeDiagnostic,
  classifyElement,
  componentById,
  isAllowedAttribute,
  isAllowedBodyElement,
  isAllowedClass,
  isCalloutKind,
  isEventHandlerAttribute,
  isIso8601,
  isJavascriptUrl,
  isNoteType,
  isRemoteUrl,
  isSuggestedRel,
  isTaskPriority,
  isUlid,
  slugify,
} from './contract.ts';

export type {
  BodyElement,
  ContractClass,
  ContractComponent,
  ElementGroup,
  ElementPlace,
  NoteType,
  NoteTypeStructure,
} from './contract.ts';

export {
  DIAGNOSTICS,
  EXIT_CODES,
  GavetaError,
  diagnosticCodes,
  exitCodeFor,
  formatDiagnostic,
  isDiagnosticCode,
  isErrorCode,
  isWarningCode,
} from './errors.ts';

export type { DiagnosticCode, DiagnosticSpec, ErrorCode, WarningCode } from './errors.ts';

export { MAX_NOTE_DEPTH, MAX_NOTE_HTML_CHARS, parseNote } from './parser.ts';

export type {
  NoteDiagnostic,
  NoteHeading,
  NoteLink,
  NoteLinkKind,
  NoteMetadata,
  NoteModel,
  NoteSection,
  NoteTask,
  ParseResult,
  SourceLocation,
  WikilinkParts,
} from './parser.ts';

export { validateNote, validateVault } from './validate.ts';

export type {
  ValidateNoteOptions,
  ValidateVaultOptions,
  ValidationResult,
  VaultFileValidation,
  VaultNoteSource,
  VaultValidation,
} from './validate.ts';

export {
  GAVETA_DIRECTORY,
  GAVETA_VAULT_ENV,
  discoverVault,
  type DiscoverVaultOptions,
  type VaultLocation,
} from './vault/discover.ts';

export { readVaultText, resolveInsideVault, writeVaultText } from './vault/paths.ts';

export { writeAtomic } from './vault/atomic.ts';

export {
  createDefaultVaultConfig,
  parseVaultConfig,
  readVaultConfig,
  writeVaultConfig,
  type VaultConfig,
} from './vault/config.ts';
