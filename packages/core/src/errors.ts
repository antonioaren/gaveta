/**
 * Stable diagnostic codes. A code is never renamed or reused.
 * Human message and hint strings live in @gaveta/i18n.
 */

import { formatMessage, getActiveLocale, type Locale, type MessageKey } from '@gaveta/i18n';

export const EXIT_CODES = {
  ok: 0,
  usage: 1,
  validation: 2,
  conflict: 3,
  notFound: 4,
  internal: 5,
} as const;

export interface DiagnosticSpec {
  readonly severity: 'error' | 'warning';
  readonly exitCode: 1 | 2 | 3 | 4 | 5 | null;
  readonly escalatesToError: boolean;
}

export const DIAGNOSTICS = {
  E_ARG_INVALID: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  E_VAULT_NOT_FOUND: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
  },
  E_REF_NOT_FOUND: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
  },
  E_REF_AMBIGUOUS: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
  },
  E_LINK_UNRESOLVED: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
  },
  E_LINK_BROKEN: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_META_MISSING: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_ID_DUPLICATE: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_HTML_INVALID: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_TYPE_STRUCTURE: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_ARTIFACT_SANDBOX: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_ARTIFACT_CSP: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_ARTIFACT_IFRAME: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_AUTH_REQUIRED: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  E_ORIGIN_INVALID: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  E_TASK_INVALID: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_UNSAFE_SCRIPT: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_UNSAFE_HANDLER: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_UNSAFE_URL: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_UNSAFE_ELEMENT: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_PATH_OUTSIDE_VAULT: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  E_CONFIG_INVALID: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_PATH_EXISTS: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  E_SKILL_PATH: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  E_SKILL_MODIFIED: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  E_HAS_BACKLINKS: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_CONFLICT: {
    severity: 'error',
    exitCode: 3,
    escalatesToError: false,
  },
  E_IF_MATCH_REQUIRED: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  E_SECTION_NOT_FOUND: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
  },
  E_TASK_NOT_FOUND: {
    severity: 'error',
    exitCode: 4,
    escalatesToError: false,
  },
  W_LINK_PENDING: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_LINK_HREF_STALE: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_NOTE_ORPHAN: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_THEME_HREF: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_MERMAID_ASSET_MISSING: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_EMBED_CYCLE: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_EMBED_DEPTH: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_EMBED_TARGET_MISSING: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_EMBED_SECTION_MISSING: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_REL_UNKNOWN: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: true,
  },
  W_REMOTE_RESOURCE: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_INLINE_STYLE_REMOVED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_CLAUDE_DROPPED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_CLASS_REMOVED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_UNSAFE_REMOVED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  E_IMPORT_PARSE: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  E_IMPORT_ABORTED: {
    severity: 'error',
    exitCode: 2,
    escalatesToError: false,
  },
  W_IMPORT_UNSUPPORTED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_IMPORT_SKIPPED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_EXPORT_LOSSY: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  E_RUNTIME_UNSUPPORTED: {
    severity: 'error',
    exitCode: 5,
    escalatesToError: false,
  },
  E_INDEX_CORRUPT: {
    severity: 'error',
    exitCode: 5,
    escalatesToError: false,
  },
  E_UPDATE_DIRTY: {
    severity: 'error',
    exitCode: 3,
    escalatesToError: false,
  },
  E_UPDATE_BRANCH: {
    severity: 'error',
    exitCode: 3,
    escalatesToError: false,
  },
  E_UPDATE_NOT_FAST_FORWARD: {
    severity: 'error',
    exitCode: 3,
    escalatesToError: false,
  },
  E_UPDATE_REMOTE: {
    severity: 'error',
    exitCode: 3,
    escalatesToError: false,
  },
  E_UPDATE_FAILED: {
    severity: 'error',
    exitCode: 5,
    escalatesToError: false,
  },
  E_UPDATE_UNSUPPORTED: {
    severity: 'error',
    exitCode: 1,
    escalatesToError: false,
  },
  W_INDEX_RECOVERED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_SKILL_OUTDATED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_VAULT_ASSET_MODIFIED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_VAULT_ASSETS_OUTDATED: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
  W_WEB_VIEWER_MISSING: {
    severity: 'warning',
    exitCode: null,
    escalatesToError: false,
  },
} as const satisfies Record<string, DiagnosticSpec>;

export type DiagnosticCode = keyof typeof DIAGNOSTICS;

export type ErrorCode = {
  [Code in DiagnosticCode]: (typeof DIAGNOSTICS)[Code]['severity'] extends 'error' ? Code : never;
}[DiagnosticCode];

export type WarningCode = {
  [Code in DiagnosticCode]: (typeof DIAGNOSTICS)[Code]['severity'] extends 'warning' ? Code : never;
}[DiagnosticCode];

export function diagnosticCodes(): DiagnosticCode[] {
  const codes: DiagnosticCode[] = [];
  for (const key of Object.keys(DIAGNOSTICS)) {
    if (isDiagnosticCode(key)) {
      codes.push(key);
    }
  }
  return codes;
}

export function isDiagnosticCode(value: string): value is DiagnosticCode {
  return Object.hasOwn(DIAGNOSTICS, value);
}

export function isErrorCode(value: string): value is ErrorCode {
  return isDiagnosticCode(value) && DIAGNOSTICS[value].severity === 'error';
}

export function isWarningCode(value: string): value is WarningCode {
  return isDiagnosticCode(value) && DIAGNOSTICS[value].severity === 'warning';
}

export function exitCodeFor(
  code: DiagnosticCode,
  options: { readonly strictRel?: boolean } = {},
): 1 | 2 | 3 | 4 | 5 | null {
  const spec = DIAGNOSTICS[code];
  if (spec.escalatesToError && options.strictRel === true) {
    return EXIT_CODES.validation;
  }
  return spec.exitCode;
}

function diagnosticKey(code: DiagnosticCode, field: 'message' | 'hint'): MessageKey {
  return `diagnostics.${code}.${field}`;
}

export function formatDiagnostic(
  code: DiagnosticCode,
  params: Readonly<Record<string, string | number>> = {},
  locale?: Locale,
): { message: string; hint: string } {
  const loc = locale ?? getActiveLocale();
  return {
    message: formatMessage(diagnosticKey(code, 'message'), loc, params),
    hint: formatMessage(diagnosticKey(code, 'hint'), loc, params),
  };
}

export class GavetaError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;

  constructor(code: ErrorCode, params: Readonly<Record<string, string | number>> = {}) {
    const formatted = formatDiagnostic(code, params);
    super(formatted.message);
    this.name = 'GavetaError';
    this.code = code;
    this.hint = formatted.hint;
  }
}
