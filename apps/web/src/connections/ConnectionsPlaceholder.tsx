export function ConnectionsPlaceholder() {
  return (
    <aside className="connections" aria-label="Panel de conexiones">
      <header className="connections__header">
        <h2 className="connections__title">Conexiones</h2>
        <p className="connections__hint">Enlaces, backlinks y grafo local (T2.5).</p>
      </header>
      <div className="connections__body">
        <p>Próximamente: salientes, backlinks con contexto y grafo cercano.</p>
      </div>
    </aside>
  );
}
