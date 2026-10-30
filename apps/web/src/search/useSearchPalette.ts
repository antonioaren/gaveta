import { useContext } from 'react';
import { SearchPaletteContext, type SearchPaletteContextValue } from './search-palette-context.ts';

export function useSearchPalette(): SearchPaletteContextValue {
  const value = useContext(SearchPaletteContext);
  if (value === null) {
    throw new Error('useSearchPalette must be used within SearchPaletteProvider');
  }
  return value;
}
