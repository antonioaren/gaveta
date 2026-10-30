import { useEffect, type RefObject } from 'react';

/** Positions a fixed overlay via CSS custom properties (CSP-friendly). */
export function useFixedPositionStyle(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  x: number,
  y: number,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const node = ref.current;
    if (node === null) {
      return;
    }
    node.style.setProperty('--menu-top', `${String(y)}px`);
    node.style.setProperty('--menu-left', `${String(x)}px`);
  }, [open, ref, x, y]);
}
