import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyResolvedTheme,
  readThemePreference,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './theme-preference.ts';
import { ThemeContext, type ThemeContextValue } from './theme-context.ts';
import { readPrefersDarkScheme, subscribePrefersDarkScheme } from './match-media-listeners.ts';

function resolveWithSystemScheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return systemDark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference());
  const [systemDark, setSystemDark] = useState<boolean>(() => readPrefersDarkScheme());
  const resolved = useMemo(
    () => resolveWithSystemScheme(preference, systemDark),
    [preference, systemDark],
  );

  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    return (
      subscribePrefersDarkScheme(() => {
        setSystemDark(readPrefersDarkScheme());
      }) ?? undefined
    );
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    (): ThemeContextValue => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
