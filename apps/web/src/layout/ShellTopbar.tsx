import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Download,
  FileText,
  Globe,
  Moon,
  MoreHorizontal,
  Network,
  Search,
  Sun,
  Upload,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Locale } from '@gaveta/i18n';
import { useMigrationActions } from '../migration/MigrationActionsContext.tsx';
import { useI18n } from '../i18n/useI18n.ts';
import { useSearchPalette } from '../search/useSearchPalette.ts';
import { useTheme } from '../theme/useTheme.ts';
import type { ThemePreference } from '../theme/theme-preference.ts';
import { IconButton } from '../ui/IconButton.tsx';
import { DropdownMenu, DropdownMenuItem } from '../ui/DropdownMenu.tsx';

const THEME_OPTIONS: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function ShellTopbar() {
  const migration = useMigrationActions();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale, setLocale } = useI18n();
  const { setOpen: setPaletteOpen } = useSearchPalette();
  const { preference, setPreference } = useTheme();

  const graphMode = location.pathname === '/grafo';
  const tasksMode = location.pathname === '/tareas';
  const notesMode = !graphMode && !tasksMode;

  const shellSegment = notesMode ? 'notes' : graphMode ? 'graph' : 'tasks';

  return (
    <header className="shell-header">
      <div className="shell-header__start">
        <div className="shell-header__brand">
          <FileText aria-hidden className="shell-header__brand-icon" size={20} strokeWidth={2} />
          <span className="shell-header__brand-name">{t('web.shell.brand')}</span>
        </div>
        <nav className="shell-segmented" aria-label={t('web.topbar.mainNav.aria')}>
          <button
            type="button"
            className={`shell-segmented__item${shellSegment === 'notes' ? ' shell-segmented__item--active' : ''}`}
            onClick={() => {
              if (!notesMode) {
                void navigate('/');
              }
            }}
          >
            {t('web.topbar.notes')}
          </button>
          <button
            type="button"
            className={`shell-segmented__item${shellSegment === 'graph' ? ' shell-segmented__item--active' : ''}`}
            onClick={() => {
              if (!graphMode) {
                void navigate('/grafo');
              }
            }}
          >
            <Network aria-hidden size={14} strokeWidth={2} />
            {t('web.topbar.graph')}
          </button>
          <button
            type="button"
            className={`shell-segmented__item${shellSegment === 'tasks' ? ' shell-segmented__item--active' : ''}`}
            data-testid="topbar-tasks"
            onClick={() => {
              void navigate(tasksMode ? '/' : '/tareas');
            }}
          >
            {t('web.topbar.tasks')}
          </button>
        </nav>
      </div>

      <div className="shell-header__center">
        <button
          type="button"
          className="shell-search-trigger"
          data-testid="search-palette-trigger"
          onClick={() => {
            setPaletteOpen(true);
          }}
        >
          <Search aria-hidden size={16} strokeWidth={2} />
          <span className="shell-search-trigger__label">{t('web.searchTrigger.label')}</span>
          <kbd className="shell-search-trigger__kbd">{t('web.searchTrigger.shortcut')}</kbd>
        </button>
      </div>

      <div className="shell-header__end">
        <IconButton
          icon={ArrowLeft}
          label={t('web.topbar.back')}
          onClick={() => {
            void navigate(-1);
          }}
        />
        <IconButton
          icon={ArrowRight}
          label={t('web.topbar.forward')}
          onClick={() => {
            void navigate(1);
          }}
        />
        <DropdownMenu
          testId="shell-settings-menu"
          trigger={({ open, toggle, menuId }) => (
            <IconButton
              icon={MoreHorizontal}
              label={t('web.topbar.more.aria')}
              aria-expanded={open}
              aria-controls={menuId}
              data-testid="shell-settings-trigger"
              onClick={toggle}
            />
          )}
        >
          <DropdownMenuItem
            testId="vault-import"
            onSelect={() => {
              migration.openImportPicker();
            }}
          >
            <Upload aria-hidden size={16} strokeWidth={2} />
            {t('web.common.import')}
          </DropdownMenuItem>
          <DropdownMenuItem
            testId="vault-export"
            onSelect={() => {
              migration.openExport({ kind: 'vault' });
            }}
          >
            <Download aria-hidden size={16} strokeWidth={2} />
            {t('web.common.exportMarkdown')}
          </DropdownMenuItem>
          <div className="ui-menu__subhead" role="presentation">
            {t('web.language.select.aria')}
          </div>
          <label className="ui-menu__select-row">
            <Globe aria-hidden size={16} strokeWidth={2} />
            <select
              className="ui-menu__select"
              data-testid="language-select"
              aria-label={t('web.language.select.aria')}
              value={locale}
              onChange={(event) => {
                setLocale(event.target.value as Locale);
              }}
            >
              <option value="en">{t('web.language.en')}</option>
              <option value="es">{t('web.language.es')}</option>
            </select>
            <ChevronDown aria-hidden size={14} className="ui-menu__select-chevron" />
          </label>
          <div className="ui-menu__subhead" role="presentation">
            {t('web.theme.select.aria')}
          </div>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => {
                setPreference(option);
              }}
            >
              {option === 'light' ? (
                <Sun aria-hidden size={16} strokeWidth={2} />
              ) : option === 'dark' ? (
                <Moon aria-hidden size={16} strokeWidth={2} />
              ) : (
                <Globe aria-hidden size={16} strokeWidth={2} />
              )}
              {t(`web.theme.${option}`)}
              {preference === option ? (
                <span className="ui-menu__check" aria-hidden>
                  ✓
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
          <select
            className="visually-hidden"
            data-testid="theme-select"
            aria-hidden
            tabIndex={-1}
            value={preference}
            disabled
          >
            {THEME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </DropdownMenu>
      </div>
    </header>
  );
}
