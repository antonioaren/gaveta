import type { SourceLocation } from '../parser.ts';
import { linkDiagnostic } from './diagnostic.ts';
import type { LinkDiagnostic, RelAssessment, RelPolicy } from './types.ts';

/** Always allowed on an anchor, including an external link's `noopener`. */
const SAFE_REL: ReadonlySet<string> = new Set(['noopener', 'noreferrer', 'nofollow']);

/**
 * DEC-03: `rel` outside the vault vocabulary is `W_REL_UNKNOWN`.
 * With `rel.strict` the same code is reported at error severity.
 * External links gain `noopener` when it is missing; unknown tokens are kept.
 */
export function assessRel(
  rel: string | null,
  policy: RelPolicy,
  location: SourceLocation | null = null,
  external = false,
): RelAssessment {
  const tokens = relTokens(rel);
  const vocabulary = new Set(policy.vocabulary);
  const diagnostics: LinkDiagnostic[] = [];
  let error = false;
  for (const token of tokens) {
    if (SAFE_REL.has(token) || vocabulary.has(token)) {
      continue;
    }
    const severity = policy.strict ? 'error' : 'warning';
    diagnostics.push(linkDiagnostic('W_REL_UNKNOWN', location, {}, { rel: token }, severity));
    if (severity === 'error') {
      error = true;
    }
  }
  let nextRel: string | null = null;
  if (external && !tokens.includes('noopener')) {
    nextRel = [...tokens, 'noopener'].join(' ');
  }
  return { diagnostics, error, nextRel };
}

function relTokens(value: string | null): string[] {
  if (value === null) {
    return [];
  }
  const tokens: string[] = [];
  for (const part of value.split(/\s+/)) {
    if (part.length > 0) {
      tokens.push(part);
    }
  }
  return tokens;
}
