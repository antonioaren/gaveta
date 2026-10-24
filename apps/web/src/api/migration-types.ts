export interface MigrationActionSummary {
  readonly created: number;
  readonly overwritten: number;
  readonly renamed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly attachments: number;
}

export interface ImportNotePreview {
  readonly sourceMd: string;
  readonly path: string;
  readonly id: string;
  readonly title: string;
  readonly warnings: readonly { code: string }[];
  readonly links: readonly { kind: string }[];
  readonly action: string;
}

export interface ImportPreviewData {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly summary: MigrationActionSummary;
  readonly notes: readonly ImportNotePreview[];
  readonly failures: readonly { sourceMd: string; code: string }[];
  readonly attachments: readonly { vaultPath: string; deduplicated: boolean }[];
}

export interface ExportPreviewData {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly blocked: boolean;
  readonly outDir: string;
  readonly summary: MigrationActionSummary;
  readonly notes: readonly { path: string; source: string }[];
  readonly attachments: readonly string[];
  readonly conflicts: readonly { path: string }[];
}
