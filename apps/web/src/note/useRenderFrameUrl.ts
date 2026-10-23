import { useEffect, useState } from 'react';
import { resolveRenderFrameUrl } from './render-frame.ts';

export function useRenderFrameUrl(noteId: string): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const state = { cancelled: false };
    void (async () => {
      const url = await resolveRenderFrameUrl(noteId);
      if (!state.cancelled) {
        setSrc(url);
      }
    })();
    return () => {
      state.cancelled = true;
    };
  }, [noteId]);

  return src;
}
