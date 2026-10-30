import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './theme-context.ts';

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export type { ThemeContextValue, ThemePreference, ResolvedTheme } from './theme-context.ts';
