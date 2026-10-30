// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  applyResolvedTheme,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from './theme-preference.ts';

describe('theme-preference', () => {
  it('defaults to system when storage is empty', () => {
    localStorage.clear();
    expect(readThemePreference()).toBe('system');
  });

  it('persists light and dark preferences', () => {
    writeThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    writeThemePreference('light');
    expect(readThemePreference()).toBe('light');
  });

  it('sets data-theme on the document element', () => {
    applyResolvedTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyResolvedTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('resolves explicit preferences without media queries', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });
});
