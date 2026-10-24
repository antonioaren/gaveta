import { useCallback } from 'react';
import { useVaultWebSocket } from '../live/useVaultWebSocket.ts';
import { useTabs } from './useTabs.ts';

export function useTabVaultSync(): void {
  // remapNotePath is stable from TabProvider; unbound-method is a false positive here.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- context callback
  const { remapNotePath } = useTabs();

  const onEvent = useCallback(
    (event: {
      readonly type: string;
      readonly path: string;
      readonly from?: string;
      readonly id: string | null;
    }) => {
      if (event.type === 'note:moved' && event.from !== undefined) {
        remapNotePath(event.from, event.path, event.id);
      }
    },
    [remapNotePath],
  );

  useVaultWebSocket(onEvent);
}
