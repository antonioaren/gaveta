import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTabs } from '../tabs/useTabs.ts';

export function NotePane() {
  const { ref: encodedRef } = useParams();
  const { tabs, activeTabId } = useTabs();

  const activeTab = useMemo(() => {
    if (encodedRef !== undefined) {
      const ref = decodeURIComponent(encodedRef);
      return tabs.find((tab) => tab.ref === ref) ?? { ref, title: ref };
    }
    const current = tabs.find((tab) => tab.id === activeTabId);
    return current ?? null;
  }, [encodedRef, tabs, activeTabId]);

  if (activeTab === null) {
    return (
      <section className="note-pane note-pane--empty" aria-label="Área de nota">
        <p className="note-pane__placeholder">Elige una nota en el explorador para empezar.</p>
      </section>
    );
  }

  const renderSrc = `/render/${encodeURIComponent(activeTab.ref)}`;

  return (
    <section className="note-pane" aria-label="Área de nota">
      <header className="note-pane__header">
        <h1 className="note-pane__title">{activeTab.title}</h1>
        <p className="note-pane__path">{activeTab.ref}</p>
      </header>
      <iframe
        className="note-pane__frame"
        title={`Vista de ${activeTab.title}`}
        src={renderSrc}
        sandbox=""
        data-testid="note-render-frame"
      />
    </section>
  );
}
