import type { DoctorFindingView } from './health-types.ts';

export interface HealthCodeGroup {
  readonly code: string;
  readonly count: number;
  readonly findings: readonly DoctorFindingView[];
}

export interface HealthSeverityGroup {
  readonly severity: 'error' | 'warning';
  readonly label: string;
  readonly total: number;
  readonly codeGroups: readonly HealthCodeGroup[];
}

const SEVERITY_LABELS: Record<'error' | 'warning', string> = {
  error: 'Errores',
  warning: 'Advertencias',
};

export function groupHealthFindings(
  findings: readonly DoctorFindingView[],
): readonly HealthSeverityGroup[] {
  const bySeverity = new Map<'error' | 'warning', Map<string, DoctorFindingView[]>>();
  for (const finding of findings) {
    const bucket = bySeverity.get(finding.severity) ?? new Map<string, DoctorFindingView[]>();
    const list = bucket.get(finding.code) ?? [];
    list.push(finding);
    bucket.set(finding.code, list);
    bySeverity.set(finding.severity, bucket);
  }
  const order: readonly ('error' | 'warning')[] = ['error', 'warning'];
  const groups: HealthSeverityGroup[] = [];
  for (const severity of order) {
    const codes = bySeverity.get(severity);
    if (codes === undefined) {
      continue;
    }
    const codeGroups: HealthCodeGroup[] = [...codes.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, items]) => ({
        code,
        count: items.length,
        findings: items,
      }));
    const total = codeGroups.reduce((sum, group) => sum + group.count, 0);
    groups.push({
      severity,
      label: SEVERITY_LABELS[severity],
      total,
      codeGroups,
    });
  }
  return groups;
}
