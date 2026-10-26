import { useEffect, useState } from 'react';
import { isCodeEditorPaletteActive, subscribeCodeEditorHost } from './code-editor-host.ts';

export function useCodeEditorPaletteActive(): boolean {
  const [active, setActive] = useState(isCodeEditorPaletteActive());
  useEffect(() => {
    return subscribeCodeEditorHost(() => {
      setActive(isCodeEditorPaletteActive());
    });
  }, []);
  return active;
}
