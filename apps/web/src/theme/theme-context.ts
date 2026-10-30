import { createContext } from 'react';
import type { ResolvedTheme, ThemePreference } from './theme-preference.ts';

export interface ThemeContextValue {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly setPreference: (next: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export type { ThemePreference, ResolvedTheme } from './theme-preference.ts';
