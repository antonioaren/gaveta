// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../i18n/render-with-i18n.tsx';
import { useWikilinkMenuListRef, type WikilinkMenuCoords } from './wikilink-menu-position.ts';

const MENU_COORDS: WikilinkMenuCoords = { top: 120, left: 80 };

function WikilinkMenuProbe({
  hits,
  coords,
}: {
  readonly hits: readonly string[];
  readonly coords: WikilinkMenuCoords | null;
}): ReactElement | null {
  const setListRef = useWikilinkMenuListRef(coords, hits.length > 0);
  if (hits.length === 0) {
    return null;
  }
  return (
    <ul
      ref={setListRef}
      data-testid="wikilink-menu-position-probe"
      className="wikilink-completion palette__list"
    />
  );
}

describe('useWikilinkMenuListRef', () => {
  it('sets menu position when hits arrive after coords are already known', () => {
    const { rerender, getByTestId } = renderWithI18n(
      <WikilinkMenuProbe hits={[]} coords={MENU_COORDS} />,
    );
    rerender(<WikilinkMenuProbe hits={['one']} coords={MENU_COORDS} />);
    const menu = getByTestId('wikilink-menu-position-probe');
    expect(menu.style.getPropertyValue('--wikilink-menu-top')).toBe('120px');
    expect(menu.style.getPropertyValue('--wikilink-menu-left')).toBe('80px');
  });
});
