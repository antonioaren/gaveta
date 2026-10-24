import { useCallback, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { MigrationActionsContext } from './MigrationActionsContext.tsx';
import {
  collectUploadFilesFromDataTransfer,
  collectUploadFilesFromFileList,
  type UploadFileEntry,
} from './collect-upload-files.ts';
import { ImportPreviewDialog } from './ImportPreviewDialog.tsx';
import { ExportMarkdownDialog, type ExportMarkdownTarget } from './ExportMarkdownDialog.tsx';

interface MigrationHostProps {
  readonly onVaultChanged: () => void;
  readonly children: ReactNode;
}

export function MigrationHost({ onVaultChanged, children }: MigrationHostProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFiles, setImportFiles] = useState<readonly UploadFileEntry[] | null>(null);
  const [exportTarget, setExportTarget] = useState<ExportMarkdownTarget | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const beginImport = useCallback((files: readonly UploadFileEntry[]) => {
    if (files.length === 0) {
      return;
    }
    setImportFiles(files);
  }, []);

  const openImportPicker = useCallback(() => {
    const input = fileInputRef.current;
    if (input !== null) {
      input.click();
    }
  }, []);

  const openExport = useCallback((target: ExportMarkdownTarget) => {
    setExportTarget(target);
  }, []);

  const actions = useMemo(
    () => ({
      openImportPicker,
      openExport,
    }),
    [openExport, openImportPicker],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      void collectUploadFilesFromDataTransfer(event.dataTransfer).then(beginImport);
    },
    [beginImport],
  );

  return (
    <div
      className={`migration-host${dragActive ? ' migration-host--drag' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDragActive(false);
        }
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="migration-host__file-input"
        data-testid="import-file-input"
        multiple
        onChange={(event) => {
          const list = event.target.files;
          if (list === null) {
            return;
          }
          void collectUploadFilesFromFileList(list).then(beginImport);
          event.target.value = '';
        }}
      />
      <MigrationActionsContext.Provider value={actions}>
        {children}
      </MigrationActionsContext.Provider>
      {dragActive ? (
        <div className="migration-host__overlay" data-testid="import-drop-overlay">
          Suelta archivos o carpetas Markdown para importar
        </div>
      ) : null}
      {importFiles !== null ? (
        <ImportPreviewDialog
          files={importFiles}
          onClose={() => {
            setImportFiles(null);
          }}
          onCommitted={onVaultChanged}
        />
      ) : null}
      {exportTarget !== null ? (
        <ExportMarkdownDialog
          target={exportTarget}
          onClose={() => {
            setExportTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
