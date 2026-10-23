import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { NoteListItem, SearchHitView } from '../api/types.ts';
import { useVaultNotes } from '../hooks/useVaultNotes.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { filterPaletteCommands, type PaletteCommand } from './palette-commands.ts';
import { resolveSearchHitOpen } from './resolve-search-hit.ts';
import { SnippetText } from './SnippetText.tsx';
import { usePaletteSearch } from './usePaletteSearch.ts';

const TYPE_LABELS: Record<string, string> = {
  doc: 'Documento',
  slides: 'Presentación',
  todo: 'Tareas',
  dashboard: 'Panel',
  design: 'Diseño',
  artifact: 'Artefacto',
};

type PaletteItem =
  | { readonly kind: 'command'; readonly command: PaletteCommand }
  | { readonly kind: 'hit'; readonly hit: SearchHitView };

interface SearchPaletteProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly notes: readonly NoteListItem[];
}

export function SearchPalette({ open, onClose, notes }: SearchPaletteProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [openError, setOpenError] = useState<string | null>(null);
  const navigate = useNavigate();
  const tabState = useTabs();
  const { hits, loading, error } = usePaletteSearch(query, open);

  const commands = useMemo(() => filterPaletteCommands(query), [query]);
  const items = useMemo((): readonly PaletteItem[] => {
    const commandItems = commands.map((command) => ({ kind: 'command' as const, command }));
    const hitItems = hits.map((hit) => ({ kind: 'hit' as const, hit }));
    return [...commandItems, ...hitItems];
  }, [commands, hits]);

  const selectedIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const closePalette = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    setOpenError(null);
    onClose();
  }, [onClose]);

  const openSearchHit = useCallback(
    async (hit: SearchHitView) => {
      const resolved = await resolveSearchHitOpen(hit, notes);
      if (!resolved.ok) {
        setOpenError(resolved.message);
        return;
      }
      tabState.openTab(resolved.ref, hit.title, hit.path, resolved.noteId);
      closePalette();
    },
    [closePalette, notes, tabState],
  );

  const activate = useCallback(
    (item: PaletteItem) => {
      if (item.kind === 'command') {
        if (item.command.id === 'nav-back') {
          void navigate(-1);
        } else if (item.command.id === 'nav-forward') {
          void navigate(1);
        }
        closePalette();
        return;
      }
      void openSearchHit(item.hit);
    },
    [closePalette, navigate, openSearchHit],
  );

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[selectedIndex];
      if (item !== undefined) {
        activate(item);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
    }
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key !== 'Tab' || dialogRef.current === null) {
      return;
    }
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) {
    return null;
  }

  const activeOptionId =
    items.length > 0 ? `${listboxId}-option-${String(selectedIndex)}` : undefined;

  return (
    <div
      className="palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closePalette();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos y búsqueda"
        onKeyDown={onDialogKeyDown}
      >
        <label className="palette__label" htmlFor={`${listboxId}-input`}>
          Buscar notas o comandos
        </label>
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          className="palette__input"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={items.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          placeholder="Buscar… (Ctrl+K)"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpenError(null);
          }}
          onKeyDown={onInputKeyDown}
        />
        <ul id={listboxId} className="palette__list" role="listbox" aria-label="Resultados">
          {items.length === 0 && !loading && error === null ? (
            <li className="palette__empty" role="presentation">
              {query.trim().length === 0
                ? 'Escribe para buscar o elige un comando de navegación.'
                : 'Sin resultados para esta búsqueda.'}
            </li>
          ) : null}
          {error !== null ? (
            <li className="palette__error" role="alert">
              {error}
            </li>
          ) : null}
          {openError !== null ? (
            <li className="palette__error" role="alert">
              {openError}
            </li>
          ) : null}
          {loading ? (
            <li className="palette__status" role="status">
              Buscando…
            </li>
          ) : null}
          {items.map((item, index) => {
            const optionId = `${listboxId}-option-${String(index)}`;
            const selected = index === selectedIndex;
            if (item.kind === 'command') {
              return (
                <li
                  key={item.command.id}
                  id={optionId}
                  role="option"
                  aria-selected={selected}
                  className={`palette__option${selected ? ' palette__option--active' : ''}`}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    activate(item);
                  }}
                >
                  <span className="palette__option-title">{item.command.label}</span>
                  <span className="palette__option-meta">Comando</span>
                </li>
              );
            }
            const hit = item.hit;
            const typeClass = hit.type ?? 'unknown';
            return (
              <li
                key={`${hit.path}-${String(index)}`}
                id={optionId}
                role="option"
                aria-selected={selected}
                className={`palette__option palette__option--note${selected ? ' palette__option--active' : ''}`}
                onMouseEnter={() => {
                  setActiveIndex(index);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  activate(item);
                }}
              >
                <div className="palette__option-row">
                  <span className="palette__option-title">{hit.title}</span>
                  {hit.type !== null ? (
                    <span className={`badge badge--${typeClass}`}>
                      {TYPE_LABELS[hit.type] ?? hit.type}
                    </span>
                  ) : null}
                </div>
                <SnippetText snippet={hit.snippet} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function SearchPaletteHost() {
  const { notes } = useVaultNotes();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <SearchPalette
      open={open}
      notes={notes}
      onClose={() => {
        setOpen(false);
      }}
    />
  );
}
