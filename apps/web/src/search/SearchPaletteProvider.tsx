import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SearchPaletteContext, type SearchPaletteContextValue } from './search-palette-context.ts';

export function SearchPaletteProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [toggle]);

  const value = useMemo(
    (): SearchPaletteContextValue => ({ open, setOpen, toggle }),
    [open, toggle],
  );

  return <SearchPaletteContext.Provider value={value}>{children}</SearchPaletteContext.Provider>;
}
