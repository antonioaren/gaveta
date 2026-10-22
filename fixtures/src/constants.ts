/** ISO-8601 timestamp shared by every fixture note. */
export const CREATED = '2026-10-22T10:00:00Z';

/** `Date.parse(CREATED)`. The generator uses it as the ULID time component. */
export const CREATED_MS = 1_792_663_200_000;

/** Suggested `rel` vocabulary from the PRD. `config.json` copies this list. */
export const REL_VOCABULARY = [
  'related',
  'depends-on',
  'part-of',
  'supersedes',
  'references',
] as const;

export type Rel = (typeof REL_VOCABULARY)[number];

/** Codes from the CLI contract that the malicious vault is meant to provoke. */
export const VALIDATOR_CODES = [
  'E_UNSAFE_SCRIPT',
  'E_UNSAFE_HANDLER',
  'E_UNSAFE_URL',
  'E_UNSAFE_ELEMENT',
  'W_REMOTE_RESOURCE',
  'W_INLINE_STYLE_REMOVED',
] as const;

export type ValidatorCode = (typeof VALIDATOR_CODES)[number];
