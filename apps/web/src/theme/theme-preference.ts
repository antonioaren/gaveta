export type ThemePreference = 'light' | 'dark' | 'system';

export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'gaveta.themePreference';

export function readThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
  } catch {
    // Private mode or blocked storage.
  }
  return 'system';
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Ignore write failures.
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  if (typeof window === 'undefined') {
    return 'light';
  }
  if (typeof window.matchMedia !== 'function') {
    return 'light';
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  return media.matches ? 'dark' : 'light';
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
}
