import { useCallback, useLayoutEffect, useRef } from 'react';

export interface WikilinkMenuCoords {
  readonly top: number;
  readonly left: number;
}

export function applyWikilinkMenuCoords(element: HTMLElement, coords: WikilinkMenuCoords): void {
  element.style.setProperty('--wikilink-menu-top', `${String(coords.top)}px`);
  element.style.setProperty('--wikilink-menu-left', `${String(coords.left)}px`);
}

/** Keeps `--wikilink-menu-top/left` in sync when coords are set before the list mounts. */
export function useWikilinkMenuListRef(
  coords: WikilinkMenuCoords | null,
  visible: boolean,
): (element: HTMLUListElement | null) => void {
  const elementRef = useRef<HTMLUListElement | null>(null);

  const syncPosition = useCallback(() => {
    const list = elementRef.current;
    if (list !== null && coords !== null) {
      applyWikilinkMenuCoords(list, coords);
    }
  }, [coords]);

  useLayoutEffect(() => {
    if (visible) {
      syncPosition();
    }
  }, [visible, syncPosition]);

  return useCallback(
    (element: HTMLUListElement | null) => {
      elementRef.current = element;
      if (element !== null && coords !== null) {
        applyWikilinkMenuCoords(element, coords);
      }
    },
    [coords],
  );
}
