import type { Editor } from '@tiptap/core';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  fetchWikilinkCompletions,
  type WikilinkCompletionView,
} from '../../api/wikilink-complete.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { visualWikilinkCompletionContext } from './wikilink-visual-context.ts';

const DEBOUNCE_MS = 150;

export interface WikilinkCompletionMenuProps {
  readonly editor: Editor | null;
}

export function WikilinkCompletionMenu({
  editor,
}: WikilinkCompletionMenuProps): ReactElement | null {
  const { t } = useI18n();
  const [contextKey, setContextKey] = useState('');
  const [hits, setHits] = useState<readonly WikilinkCompletionView[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const applyHit = useCallback(
    (hit: WikilinkCompletionView) => {
      if (editor === null) {
        return;
      }
      const context = visualWikilinkCompletionContext(editor);
      if (context === null) {
        return;
      }
      editor
        .chain()
        .focus()
        .insertContentAt({ from: context.from, to: context.to }, `${hit.title}]]`)
        .run();
      setContextKey('');
      setHits([]);
      setCoords(null);
    },
    [editor],
  );

  useEffect(() => {
    if (editor === null) {
      return;
    }
    const refresh = (): void => {
      const context = visualWikilinkCompletionContext(editor);
      if (context === null) {
        setContextKey('');
        setHits([]);
        setCoords(null);
        return;
      }
      const key = `${String(context.from)}:${String(context.to)}:${context.query}`;
      setContextKey(key);
      setActiveIndex(0);
      const view = editor.view;
      const position = view.coordsAtPos(context.to);
      setCoords({ top: position.bottom, left: position.left });
    };
    refresh();
    editor.on('selectionUpdate', refresh);
    editor.on('update', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('update', refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (contextKey.length === 0 || editor === null) {
      return;
    }
    const context = visualWikilinkCompletionContext(editor);
    if (context === null) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchWikilinkCompletions(context.query).then((next) => {
        if (!cancelled) {
          setHits(next);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contextKey, editor]);

  useEffect(() => {
    if (editor === null || hits.length === 0) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (hits.length === 0) {
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % hits.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + hits.length) % hits.length);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        const hit = hits[activeIndex];
        if (hit !== undefined) {
          event.preventDefault();
          applyHit(hit);
        }
      } else if (event.key === 'Escape') {
        setHits([]);
        setContextKey('');
      }
    };
    editor.view.dom.addEventListener('keydown', onKeyDown, true);
    return () => {
      editor.view.dom.removeEventListener('keydown', onKeyDown, true);
    };
  }, [activeIndex, applyHit, editor, hits]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null || coords === null) {
      return;
    }
    list.style.setProperty('--wikilink-menu-top', `${String(coords.top)}px`);
    list.style.setProperty('--wikilink-menu-left', `${String(coords.left)}px`);
  }, [coords]);

  if (coords === null || hits.length === 0 || contextKey.length === 0) {
    return null;
  }

  return (
    <ul
      ref={listRef}
      className="wikilink-completion palette__list"
      role="listbox"
      aria-label={t('web.editor.wikilink.completion.ariaList')}
      data-testid="wikilink-completion-list"
    >
      {hits.map((hit, index) => {
        const alias =
          hit.matchedBy === 'alias'
            ? t('web.editor.wikilink.completion.aliasDetail', { alias: hit.matchedLabel })
            : hit.path;
        return (
          <li key={`${hit.path}-${hit.matchedLabel}`} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={
                index === activeIndex
                  ? 'palette__option palette__option--active wikilink-completion__option'
                  : 'palette__option wikilink-completion__option'
              }
              onMouseDown={(event) => {
                event.preventDefault();
                applyHit(hit);
              }}
            >
              <span className="palette__option-row">
                <span className="palette__option-title">{hit.title}</span>
                <span className="palette__option-meta">{alias}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
