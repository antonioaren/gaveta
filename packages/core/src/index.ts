/** Package id. Parser and vault operations land in later phase-1 tasks. */
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
  diagnosticCodes,
  exitCodeFor,
  formatDiagnostic,
  isDiagnosticCode,
  isErrorCode,
  isWarningCode,
} from './errors.ts';

export type { DiagnosticCode, DiagnosticSpec, ErrorCode, WarningCode } from './errors.ts';
