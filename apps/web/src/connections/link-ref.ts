import type { BacklinkView, OutgoingLinkView } from '../api/types.ts';
import { isNoteUlid } from '../notes/viewer-ref.ts';

export function viewerRefForOutgoing(link: OutgoingLinkView): string | null {
  const { target } = link;
  if (target.id !== null && isNoteUlid(target.id)) {
    return target.id;
  }
  if (target.path !== null && target.path.length > 0) {
    return target.path;
  }
  if (target.ghost && target.title.length > 0) {
    return target.title;
  }
  return null;
}

export function viewerRefForBacklink(link: BacklinkView): string | null {
  if (link.sourceId !== null && isNoteUlid(link.sourceId)) {
    return link.sourceId;
  }
  if (link.sourcePath.length > 0) {
    return link.sourcePath;
  }
  return null;
}
