/* eslint-disable react-refresh/only-export-components -- test helper wrappers */
import { render, type RenderOptions } from '@testing-library/react';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import { I18nProvider } from './I18nProvider.tsx';
import { useI18n } from './useI18n.ts';
import type { Locale } from '@gaveta/i18n';

interface WrapperOptions {
  readonly locale?: Locale;
}

function PinLocale({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}): ReactElement {
  const { setLocale } = useI18n();
  useEffect(() => {
    setLocale(locale);
  }, [locale, setLocale]);
  return <>{children}</>;
}

function I18nTestWrapper({
  children,
  locale = 'es',
}: {
  readonly children: ReactNode;
  readonly locale?: Locale;
}): ReactElement {
  return (
    <I18nProvider>
      <PinLocale locale={locale}>{children}</PinLocale>
    </I18nProvider>
  );
}

export function renderWithI18n(
  ui: ReactElement,
  options?: RenderOptions & WrapperOptions,
): ReturnType<typeof render> {
  const { locale = 'es', ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: ({ children }) => <I18nTestWrapper locale={locale}>{children}</I18nTestWrapper>,
    ...renderOptions,
  });
}
