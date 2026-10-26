// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../i18n/render-with-i18n.tsx';
import { OpenInVsCodeButton } from './OpenInVsCodeButton.tsx';

const locationAssign = vi.fn();

beforeEach(() => {
  locationAssign.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            schemaVersion: 1,
            data: { uri: 'vscode://file/tmp/vault/nota.html' },
          }),
      } as Response),
    ),
  );
  vi.stubGlobal('location', { assign: locationAssign });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('fetches the vscode URI on click and opens it', async () => {
  const user = userEvent.setup();
  renderWithI18n(<OpenInVsCodeButton noteRef="01NOTE" />, { locale: 'en' });
  await user.click(screen.getByTestId('open-in-vscode'));
  await waitFor(() => {
    expect(locationAssign).toHaveBeenCalledWith('vscode://file/tmp/vault/nota.html');
  });
});
