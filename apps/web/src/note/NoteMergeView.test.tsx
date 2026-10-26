// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../i18n/render-with-i18n.tsx';
import { NoteMergeView } from './NoteMergeView.tsx';

describe('NoteMergeView', () => {
  it('renders diff rows and action buttons', () => {
    renderWithI18n(
      <NoteMergeView
        yoursHtml={'<p>yours</p>'}
        theirsHtml={'<p>theirs</p>'}
        onAcceptTheirs={vi.fn()}
        onKeepMine={vi.fn()}
        onClose={vi.fn()}
      />,
      { locale: 'en' },
    );
    expect(screen.getByTestId('note-merge-view')).toBeInTheDocument();
    expect(screen.getByTestId('note-merge-diff').textContent).toContain('yours');
    expect(screen.getByTestId('note-merge-diff').textContent).toContain('theirs');
    expect(screen.getByTestId('note-merge-keep-mine')).toBeInTheDocument();
  });
});
