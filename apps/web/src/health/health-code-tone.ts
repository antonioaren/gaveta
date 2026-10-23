export type HealthCodeTone = 'danger' | 'warn' | 'info' | 'pending';

const CODE_TONES: Readonly<Record<string, HealthCodeTone>> = {
  E_LINK_BROKEN: 'danger',
  E_ID_DUPLICATE: 'danger',
  W_LINK_PENDING: 'pending',
  W_NOTE_ORPHAN: 'warn',
  W_LINK_HREF_STALE: 'info',
  W_THEME_HREF: 'info',
  W_VAULT_ASSETS_OUTDATED: 'warn',
  W_MERMAID_ASSET_MISSING: 'warn',
};

export function healthCodeTone(code: string, severity: 'error' | 'warning'): HealthCodeTone {
  const mapped = CODE_TONES[code];
  if (mapped !== undefined) {
    return mapped;
  }
  return severity === 'error' ? 'danger' : 'warn';
}
