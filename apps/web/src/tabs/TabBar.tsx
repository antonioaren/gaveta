import { useI18n } from '../i18n/useI18n.ts';
import { useTabs } from './useTabs.ts';

export function TabBar() {
  const { t } = useI18n();
  const tabState = useTabs();

  if (tabState.tabs.length === 0) {
    return null;
  }

  return (
    <div className="tab-strip" role="tablist" aria-label={t('web.tabs.aria')}>
      {tabState.tabs.map((tab) => {
        const selected = tab.id === tabState.activeTabId;
        return (
          <div
            key={tab.id}
            className={`tab-strip__item${selected ? ' tab-strip__item--active' : ''}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              className="tab-strip__tab"
              onClick={() => {
                tabState.activateTab(tab.id);
              }}
            >
              {tab.title}
            </button>
            <button
              type="button"
              className="tab-strip__close"
              aria-label={t('web.tabs.close', { title: tab.title })}
              onClick={() => {
                tabState.closeTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
