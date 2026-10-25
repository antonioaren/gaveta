import { useActiveViewerRef } from '../hooks/useActiveViewerRef.ts';
import { useConnectionsData } from '../hooks/useConnectionsData.ts';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { LocalGraph } from './LocalGraph.tsx';
import { plainTextFromContext } from './plain-text.ts';
import { viewerRefForBacklink, viewerRefForOutgoing } from './link-ref.ts';
import { useI18n } from '../i18n/useI18n.ts';

export function ConnectionsPanel() {
  const { t } = useI18n();
  const { ref } = useActiveViewerRef();
  const { links, backlinks, graph, loading, error } = useConnectionsData(ref);
  const tabState = useTabs();

  const navigateTo = (
    targetRef: string,
    title: string,
    targetPath: string,
    noteId: string | null,
  ) => {
    const id = noteId ?? (isNoteUlid(targetRef) ? targetRef : null);
    tabState.openTab(targetRef, title, targetPath, id);
  };

  return (
    <aside className="connections" aria-label={t('web.connections.aria')}>
      <header className="connections__header">
        <h2 className="connections__title">{t('web.connections.title')}</h2>
        <p className="connections__hint">{t('web.connections.hint')}</p>
      </header>
      <div className="connections__body">
        {ref === null ? (
          <p className="connections__empty">{t('web.connections.empty.openNote')}</p>
        ) : loading ? (
          <p className="connections__status" role="status">
            {t('web.connections.loading')}
          </p>
        ) : error !== null ? (
          <p className="connections__status connections__status--error" role="alert">
            {error}
          </p>
        ) : (
          <>
            <section className="connections__section" aria-labelledby="connections-outgoing">
              <h3 id="connections-outgoing" className="connections__section-title">
                {t('web.connections.outgoing.title')}
              </h3>
              {links === null || links.links.length === 0 ? (
                <p className="connections__empty">{t('web.connections.outgoing.empty')}</p>
              ) : (
                <ul className="connections__list">
                  {links.links.map((link, index) => {
                    const targetRef = viewerRefForOutgoing(link);
                    const key = `${link.target.title}-${String(index)}`;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          className="connections__link"
                          disabled={targetRef === null}
                          onClick={() => {
                            if (targetRef === null) {
                              return;
                            }
                            const noteId =
                              link.target.id !== null && isNoteUlid(link.target.id)
                                ? link.target.id
                                : null;
                            navigateTo(
                              targetRef,
                              link.target.title,
                              link.target.path ?? targetRef,
                              noteId,
                            );
                          }}
                        >
                          <span className="connections__link-title">{link.target.title}</span>
                          {link.rel !== null && link.rel.length > 0 ? (
                            <span className="connections__rel">{link.rel}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="connections__section" aria-labelledby="connections-backlinks">
              <h3 id="connections-backlinks" className="connections__section-title">
                {t('web.connections.backlinks.title')}
              </h3>
              {backlinks === null || backlinks.backlinks.length === 0 ? (
                <p className="connections__empty">{t('web.connections.backlinks.empty')}</p>
              ) : (
                <ul
                  className="connections__list connections__list--backlinks"
                  aria-label={t('web.connections.backlinks.ariaList')}
                >
                  {backlinks.backlinks.map((link, index) => {
                    const sourceRef = viewerRefForBacklink(link);
                    const key = `${link.sourcePath}-${String(index)}`;
                    const context = plainTextFromContext(link.context);
                    return (
                      <li key={key} className="connections__backlink">
                        <button
                          type="button"
                          className="connections__link"
                          disabled={sourceRef === null}
                          onClick={() => {
                            if (sourceRef === null) {
                              return;
                            }
                            const noteId =
                              link.sourceId !== null && isNoteUlid(link.sourceId)
                                ? link.sourceId
                                : null;
                            navigateTo(sourceRef, link.sourceTitle, link.sourcePath, noteId);
                          }}
                        >
                          <span className="connections__link-title">{link.sourceTitle}</span>
                        </button>
                        {context.length > 0 ? (
                          <p className="connections__context">{context}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="connections__section" aria-labelledby="connections-graph">
              <h3 id="connections-graph" className="connections__section-title">
                {t('web.connections.graph.title')}
              </h3>
              {graph === null ? (
                <p className="connections__empty">{t('web.connections.graph.empty')}</p>
              ) : (
                <LocalGraph
                  nodes={graph.nodes}
                  edges={graph.edges}
                  centerRef={ref}
                  onNavigate={navigateTo}
                />
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
