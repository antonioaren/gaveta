import { useCallback, useState, type ReactNode } from 'react';
import type { NoteListItem } from '../api/types.ts';
import { NoteOpsDialog } from './NoteOpsDialog.tsx';
import type { NoteOpKind, NoteOpTarget } from './note-op-target.ts';
import { useTabVaultSync } from '../tabs/useTabVaultSync.ts';

interface NoteOpsHostProps {
  readonly notes: readonly NoteListItem[];
  readonly onRefreshNotes: () => void;
  readonly children: (openOp: (kind: NoteOpKind, target: NoteOpTarget) => void) => ReactNode;
}

export function NoteOpsHost({ notes, onRefreshNotes, children }: NoteOpsHostProps) {
  useTabVaultSync();
  const [kind, setKind] = useState<NoteOpKind | null>(null);
  const [target, setTarget] = useState<NoteOpTarget | null>(null);

  const openOp = useCallback((nextKind: NoteOpKind, nextTarget: NoteOpTarget) => {
    setKind(nextKind);
    setTarget(nextTarget);
  }, []);

  const close = useCallback(() => {
    setKind(null);
    setTarget(null);
  }, []);

  return (
    <>
      {children(openOp)}
      {kind !== null && target !== null ? (
        <NoteOpsDialog
          key={`${kind}-${target.path}`}
          kind={kind}
          target={target}
          notes={notes}
          onClose={close}
          onConflictRefresh={onRefreshNotes}
        />
      ) : null}
    </>
  );
}
