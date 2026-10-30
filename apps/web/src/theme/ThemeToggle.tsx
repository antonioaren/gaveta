import { useI18n } from '../i18n/useI18n.ts';
import { useTheme } from './useTheme.ts';
import type { ThemePreference } from './theme-preference.ts';

const OPTIONS: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const { t } = useI18n();

  return (
    <label className="topbar__theme">
      <span className="visually-hidden">{t('web.theme.select.aria')}</span>
      <select
        className="topbar__button topbar__button--select"
        data-testid="theme-select"
        aria-label={t('web.theme.select.aria')}
        value={preference}
        onChange={(event) => {
          setPreference(event.target.value as ThemePreference);
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option} value={option}>
            {t(`web.theme.${option}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
