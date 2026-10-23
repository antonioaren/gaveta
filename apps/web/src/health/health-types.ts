export interface DoctorFindingView {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
  readonly path: string;
  readonly details: Readonly<Record<string, string | number>> | null;
  readonly severity: 'error' | 'warning';
  readonly noteId: string | null;
}

export interface DoctorResponse {
  readonly ok: boolean;
  readonly findings: readonly DoctorFindingView[];
}
