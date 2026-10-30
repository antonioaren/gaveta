import { createContext } from 'react';

export interface SearchPaletteContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
}

export const SearchPaletteContext = createContext<SearchPaletteContextValue | null>(null);
