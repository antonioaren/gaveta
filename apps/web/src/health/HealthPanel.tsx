import { useMemo } from 'react';
import { useHealthData } from '../hooks/useHealthData.ts';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { viewerRefForFinding } from './finding-viewer-ref.ts';
import { groupHealthFindings } from './group-health-findings.ts';
import { healthCodeTone } from './health-code-tone.ts';
import { plainTextFromContext } from '../connections/plain-text.ts';

export function HealthPanel() {
  const { report, loading, error, externalChangeNotice, dismissExternalNotice } = useHealthData();
  const tabState = useTabs();
  const groups = useMemo(() => groupHealthFindings(report?.findings ?? []), [report?.findings]);

  const openFinding = (path: string, noteId: string | null): void => {
    const ref = noteId !== null && isNoteUlid(noteId) ? noteId : path;
    tabState.openTab(ref, path, path, noteId !== null && isNoteUlid(noteId) ? noteId : null);
  };

  return (
    <aside className="health" aria-label="Panel de salud">
      <header className="health__header">
        <h2 className="health__title">Salud</h2>
        <p className="health__hint">Hallazgos de gaveta doctor.</p>
      </header>
      <div className="health__body">
        {externalChangeNotice ? (
          <div className="health__alert" role="alert">
            <p className="health__alert-text">
              Un cambio externo ha afectado la salud del vault (enlaces o contrato).
            </p>
            <button type="button" className="health__alert-dismiss" onClick={dismissExternalNotice}>
              Entendido
            </button>
          </div>
        ) : null}
        {loading ? (
          <p className="health__status" role="status">
            Cargando salud…
          </p>
        ) : error !== null ? (
          <p className="health__status health__status--error" role="alert">
            {error}
          </p>
        ) : (report?.findings.length ?? 0) === 0 ? (
          <p className="health__empty">Sin problemas detectados.</p>
        ) : (
          groups.map((group) => (
            <section
              key={group.severity}
              className={`health__group health__group--${group.severity}`}
              aria-labelledby={`health-${group.severity}`}
            >
              <h3 id={`health-${group.severity}`} className="health__group-title">
                {group.label}
                <span className="health__group-count">{String(group.total)}</span>
              </h3>
              {group.codeGroups.map((codeGroup) => (
                <div key={codeGroup.code} className="health__code-block">
                  <h4 className="health__code-title">
                    <span
                      className={`health__code-badge health__code-badge--${healthCodeTone(
                        codeGroup.code,
                        group.severity,
                      )}`}
                    >
                      {codeGroup.code}
                    </span>
                    <span className="health__code-count">{String(codeGroup.count)}</span>
                  </h4>
                  <ul className="health__list">
                    {codeGroup.findings.map((finding) => {
                      const viewerRef = viewerRefForFinding(finding);
                      const label = plainTextFromContext(finding.message);
                      return (
                        <li key={`${finding.path}:${finding.code}:${label}`}>
                          <button
                            type="button"
                            className="health__finding"
                            disabled={viewerRef === null}
                            onClick={() => {
                              openFinding(finding.path, finding.noteId);
                            }}
                          >
                            <span className="health__finding-path">{finding.path}</span>
                            <span className="health__finding-message">{label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
