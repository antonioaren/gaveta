import { join } from 'node:path';
import { scanTrackedFilesForConflictMarkers } from './conflict-markers.ts';

const root = join(import.meta.dirname, '..');
const failures = scanTrackedFilesForConflictMarkers(root);

if (failures.length > 0) {
  for (const failure of failures) {
    for (const hit of failure.hits) {
      process.stderr.write(
        `${failure.path}:${String(hit.line)}: merge conflict marker (${hit.kind})\n`,
      );
    }
  }
  process.stderr.write(
    'Tracked files contain git merge conflict markers. Resolve them before committing.\n',
  );
  process.exit(1);
}
