import { isNoteUlid } from '../notes/viewer-ref.ts';
import type { DoctorFindingView } from './health-types.ts';

/** Viewer ref for `/nota/:ref`: ULID when indexed, otherwise vault path. */
export function viewerRefForFinding(finding: DoctorFindingView): string | null {
  if (finding.noteId !== null && isNoteUlid(finding.noteId)) {
    return finding.noteId;
  }
  if (finding.path.endsWith('.html')) {
    return finding.path;
  }
  return null;
}
