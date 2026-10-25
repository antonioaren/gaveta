import { formatMessage } from '@gaveta/i18n';
import { expect, it } from 'vitest';
import { groupHealthFindings } from './group-health-findings.ts';
import type { DoctorFindingView } from './health-types.ts';

function finding(code: string, severity: 'error' | 'warning', path: string): DoctorFindingView {
  return {
    code,
    severity,
    path,
    message: code,
    hint: 'hint',
    details: null,
    noteId: null,
  };
}

const severityLabels = {
  error: formatMessage('web.health.severity.error', 'es'),
  warning: formatMessage('web.health.severity.warning', 'es'),
};

it('groups findings by severity and diagnostic code with counts', () => {
  const groups = groupHealthFindings(
    [
      finding('E_LINK_BROKEN', 'error', 'a.html'),
      finding('E_LINK_BROKEN', 'error', 'b.html'),
      finding('W_LINK_PENDING', 'warning', 'c.html'),
    ],
    severityLabels,
  );
  expect(groups).toHaveLength(2);
  expect(groups[0]).toMatchObject({ severity: 'error', label: 'Errores', total: 2 });
  expect(groups[0]?.codeGroups[0]).toMatchObject({ code: 'E_LINK_BROKEN', count: 2 });
  expect(groups[1]).toMatchObject({ severity: 'warning', total: 1 });
});
