import './sqlite/warning.ts';

/** Package id. */
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

export {
  GUIDE_TOPICS,
  buildGuide,
  isGuideTopic,
  type GuideBuildOptions,
  type GuideCommandEntry,
  type GuideDiagnosticEntry,
  type GuideResult,
  type GuideTopic,
} from './guide.ts';

export { AGENT_VAULT_BULLETS, AGENT_WORKFLOW_BULLETS } from './agent-workflow.ts';

export {
  SKILL_CLI_VERSION_FIELD,
  SKILL_NAME,
  SKILL_REFERENCE_PATHS,
  buildSkill,
  type SkillBuildOptions,
  type SkillBundle,
  type SkillFile,
} from './skill.ts';

export {
  findInvalidSkillMentions,
  type SkillCliCatalog,
  type SkillMentionIssue,
} from './skill-mentions.ts';

export { tokensFromGavetaExample, tokenizeShellLine } from './shell-tokens.ts';

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

export { normalizeNote } from './normalize.ts';

export type { NormalizeNoteOptions, NormalizeResult } from './normalize.ts';

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

export { writeAtomic, writeAtomicBuffer } from './vault/atomic.ts';

export {
  createDefaultVaultConfig,
  parseVaultConfig,
  readVaultConfig,
  writeVaultConfig,
  type VaultConfig,
} from './vault/config.ts';

export { DEFAULT_THEME_CSS } from './theme/theme.ts';

export {
  DEFAULT_MERMAID_BOOT_JS,
  DEFAULT_MERMAID_LICENSE,
  DEFAULT_MERMAID_MIN_JS,
  MERMAID_BOOT_BASENAME,
  MERMAID_META,
  MERMAID_MIN_BASENAME,
  MERMAID_VAULT_ASSETS,
  mermaidAssetHref,
} from './mermaid/assets.ts';

export { isTrustedMermaidScript, sanitizeMermaidSource } from './mermaid/normalize.ts';

export {
  assertNoteAttachmentPathAllowed,
  collectNoteAttachmentPaths,
  isBlockedRenderVaultPath,
} from './render/attachments.ts';

export {
  GAVETA_NAVIGATE_MESSAGE_TYPE,
  parseGavetaNavigateMessage,
  type GavetaNavigateMessage,
} from './render/navigate-message.ts';

export {
  GAVETA_TASK_CHECKED_MESSAGE_TYPE,
  GAVETA_TASK_TOGGLE_MESSAGE_TYPE,
  parseGavetaTaskCheckedMessage,
  parseGavetaTaskToggleMessage,
  type GavetaTaskCheckedMessage,
  type GavetaTaskToggleMessage,
} from './render/task-toggle-message.ts';

export {
  appendRenderTicketQuery,
  buildNoteRenderCsp,
  buildNoteRenderPage,
  readRenderNoteId,
  resolveRenderNote,
  RENDER_STATIC_PREFIX,
} from './render/note-page.ts';

export {
  buildRenderTypeLayout,
  collectSlideThumbTargets,
  type RenderTypeLayout,
  type SlideThumbTarget,
} from './render/type-views.ts';

export { doctorVault } from './doctor.ts';

export type { DoctorFinding, DoctorFix, DoctorReport, DoctorVaultOptions } from './doctor.ts';

export { adoptNote } from './adopt.ts';

export { convertClaudeHtml } from './convert/claude.ts';

export { convertMarkdownToHtml, finalizeMarkdownHtml } from './convert/md-to-html.ts';

export { importMarkdownFolder } from './import/folder.ts';

export type {
  ImportAttachmentReport,
  ImportFailureReport,
  ImportMarkdownFolderOptions,
  ImportMarkdownFolderResult,
  ImportNoteLink,
  ImportNoteReport,
  ImportOnConflict,
  ImportWarning,
} from './import/folder.ts';

export { convertHtmlToMarkdown } from './convert/html-to-md.ts';

export {
  listLossyMarkdownFixtureNotes,
  listMdastEquivalentFixturePaths,
  mdastBodiesEquivalent,
  noteSemanticSnapshot,
  roundTripHtmlNoteInVault,
  roundTripMarkdownFixture,
  roundTripMarkdownSource,
  stripMarkdownFrontMatter,
  warningCodes,
  withMarkdownImportVault,
} from './convert/round-trip.ts';

export type { MarkdownRoundTripResult, NoteSemanticSnapshot } from './convert/round-trip.ts';

export {
  exportMdPathCaseCollisions,
  exportVaultToMarkdown,
  resolveInsideExport,
} from './export.ts';

export type {
  FinalizeMarkdownOptions,
  FinalizeMarkdownResult,
  MarkdownConvertOptions,
  MarkdownConvertResult,
  MarkdownConvertWarning,
} from './convert/md-to-html.ts';

export type {
  HtmlExportLinksMode,
  HtmlExportLoss,
  HtmlExportTarget,
  HtmlToMarkdownOptions,
  HtmlToMarkdownResult,
  HtmlToMarkdownWarning,
} from './convert/html-to-md.ts';

export type {
  ExportConflict,
  ExportConflictDetail,
  ExportFormat,
  ExportVaultOptions,
  ExportVaultReport,
  ExportedNoteReport,
} from './export.ts';

export type {
  ClaudeConvertOptions,
  ClaudeConvertResult,
  ClaudeConvertWarning,
} from './convert/claude.ts';

export {
  ARTIFACT_CDN_META,
  ARTIFACT_CSP_CDN,
  ARTIFACT_CSP_OFFLINE,
  ARTIFACT_SANDBOX,
  buildArtifactBody,
  escapeSrcdoc,
  expectedArtifactCsp,
  plainTextFromSrcdoc,
  readArtifactAllowCdn,
  readArtifactSrcdoc,
} from './artifact.ts';

export type { AdoptOptions, AdoptResult, AdoptWarning } from './adopt.ts';

export { readWorkspaceVersion, workspaceRootFromModuleUrl } from './workspace-version.ts';

export { changelogEntriesBetween } from './changelog.ts';

export {
  applyGitUpdate,
  checkGitUpdate,
  defaultUpdateChannel,
  resolveInstallInfo,
  type GitCheckoutInfo,
  type GitUpdateApplyResult,
  type GitUpdateCheckResult,
  type GitUpdateOptions,
  type GitUpdateTarget,
  type InstallInfo,
  type InstallMethod,
  type UpdateChannel,
} from './install/git.ts';

export { GAVETA_ALLOWED_REMOTES, GAVETA_GITHUB_REPO } from './install/constants.ts';

export { isAllowedGavetaRemote, normalizeRemoteUrl } from './install/remote.ts';

export { defaultProcessRunner, type ProcessRunner, type SpawnResult } from './process-runner.ts';

export {
  hashVaultAsset,
  upgradeVaultAssets,
  vaultAssetsNeedUpgrade,
  type UpgradeVaultAssetsResult,
  type VaultAssetUpgradeWarning,
} from './vault/assets.ts';

export { initVault } from './vault/init.ts';

export type { AgentInstructionResult, InitVaultOptions, InitVaultResult } from './vault/init.ts';

export {
  AGENT_INSTRUCTION_TARGETS,
  agentInstructionRelativePath,
  expandAgentInstructionTargets,
  isAgentInstructionTarget,
  mergeAgentInstructionFile,
  type AgentInstructionTarget,
} from './vault/agent-instructions.ts';

export {
  SKILL_SCOPES,
  SKILL_TARGETS,
  compareCliVersions,
  expandSkillTargets,
  isSkillScope,
  isSkillTarget,
  parseInstalledSkillVersion,
  resolveInsideAnchor,
  skillDirectoryRelative,
  skillInstall,
  skillStatus,
  type SkillInstallOptions,
  type SkillInstallResult,
  type SkillInstallState,
  type SkillLocationReport,
  type SkillScope,
  type SkillStatusOptions,
  type SkillStatusResult,
  type SkillTarget,
} from './skill-install.ts';

export { resolveInitDirectory } from './vault/init-target.ts';

export type { ResolveInitDirectoryOptions } from './vault/init-target.ts';

export {
  MIN_SUPPORTED_NODE,
  assertRuntimeSupported,
  isNodeVersionAtLeast,
  probeFts5,
  runtimeUnsupportedFromSqlite,
  sqliteIndicatesMissingFts5,
} from './runtime.ts';

export type { RuntimeProbe } from './runtime.ts';

export {
  INDEX_RELATIVE_PATH,
  INDEX_SCHEMA_VERSION,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_SNIPPET_END,
  SEARCH_SNIPPET_START,
  foldMatchKey,
  openVaultIndex,
} from './sqlite/store.ts';

export { scanNoteFiles } from './sqlite/scan.ts';

export type { ScannedFile, ScannedVault, ScanProblem } from './sqlite/scan.ts';

export type {
  DuplicateId,
  IndexProblem,
  IndexedAlias,
  IndexedLink,
  IndexedNote,
  IndexedSection,
  IndexedTask,
  ReindexReport,
  SearchHit,
  SearchOptions,
  VaultIndex,
} from './sqlite/store.ts';

export {
  BACKLINK_CONTEXT_LIMIT,
  GRAPH_DEPTH_MAX,
  GRAPH_DEPTH_MIN,
  GRAPH_GHOST_PREFIX,
  backlinks,
  globalGraph,
  graphGhostKey,
  localGraph,
  notePathInFolder,
  outgoingLinks,
} from './graph.ts';

export type {
  Backlink,
  Graph,
  GraphEdge,
  GraphFilters,
  GraphNode,
  LinkTarget,
  LocalGraphOptions,
  OutgoingLink,
} from './graph.ts';

export {
  SUGGESTION_LIMIT,
  GavetaRefError,
  assessRel,
  relativeNoteHref,
  promotePendingAnchors,
  promotePendingLinks,
  resolveNoteLinks,
  resolveRef,
  resolveTitle,
  suggestNotes,
} from './links/index.ts';

export type {
  LinkDiagnostic,
  NoteRef,
  NoteSuggestion,
  RelAssessment,
  RelPolicy,
  ResolveNoteLinksOptions,
  ResolveNoteLinksResult,
  PromoteAnchorsResult,
  PromotePendingNote,
  PromotePendingResult,
  PromotedAnchor,
  PromotedNote,
  ResolvedLink,
  ResolvedRef,
} from './links/index.ts';

export { GavetaOperationError } from './ops/error.ts';
export { moveNote } from './ops/move.ts';
export { removeNote } from './ops/remove.ts';

export type { AffectedNote, MoveNoteResult, RemoveNoteResult } from './ops/types.ts';

export {
  ABSENT_NOTE_HASH,
  NOTE_CONTENT_HASH_PATTERN,
  parseNoteContentHash,
  requireNoteContentHash,
} from './if-match.ts';

export { createNote, editNote, linkNote, noteContentHash, readNote } from './notes.ts';

export { addTaskToNote, checkTask, listTasks, uncheckTask } from './todos.ts';

export type { AddTaskResult, ListedTask, ListTasksResult, ToggleTaskResult } from './todos.ts';

export type {
  CreateNoteResult,
  EditNoteResult,
  LinkNoteResult,
  LinkNoteSuccess,
  NoteOutline,
  NoteWarning,
  NoteWriteFailure,
  OutlineLink,
  OutlineSection,
  OutlineTask,
  ReadNoteResult,
  SavedLink,
} from './notes.ts';
