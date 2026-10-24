import type {
  CreateNoteResult,
  EditNoteResult,
  LinkNoteResult,
  MoveNoteResult,
  RemoveNoteResult,
  SavedLink,
  ToggleTaskResult,
} from '@gaveta/core';

type CreateOk = Extract<CreateNoteResult, { ok: true }>;
type EditOk = Extract<EditNoteResult, { ok: true }>;
type LinkOk = Extract<LinkNoteResult, { ok: true }>;

export function presentCreatedNote(created: CreateOk): Record<string, unknown> {
  return {
    id: created.id,
    path: created.path,
    hash: created.hash,
    title: created.title,
    type: created.type,
    links: presentSavedLinks(created.links),
    promoted: created.promoted.map((note) => ({
      path: note.path,
      anchors: note.anchors.map((anchor) => ({
        pendingTitle: anchor.pendingTitle,
        href: anchor.href,
        text: anchor.text,
        matchedBy: anchor.matchedBy,
      })),
    })),
  };
}

export function presentEditedNote(edited: EditOk): Record<string, unknown> {
  return {
    id: edited.id,
    path: edited.path,
    hash: edited.hash,
    title: edited.title,
    type: edited.type,
    section: edited.section,
    links: presentSavedLinks(edited.links),
  };
}

export function presentLinkedNote(linked: LinkOk): Record<string, unknown> {
  return {
    id: linked.id,
    path: linked.path,
    hash: linked.hash,
    title: linked.title,
    type: linked.type,
    section: linked.section,
    added: linked.added,
    links: presentSavedLinks(linked.links),
  };
}

export function presentMovedNote(moved: MoveNoteResult): Record<string, unknown> {
  return {
    id: moved.id,
    from: moved.from,
    to: moved.to,
    rewritten: [...moved.rewritten],
  };
}

export function presentRemovedNote(removed: RemoveNoteResult): Record<string, unknown> {
  return {
    id: removed.id,
    path: removed.path,
    title: removed.title,
    forced: removed.forced,
    pending: [...removed.pending],
  };
}

export function presentTaskMutation(
  result: Extract<ToggleTaskResult, { ok: true }>,
): Record<string, unknown> {
  return {
    id: result.id,
    path: result.path,
    hash: result.hash,
    taskId: result.taskId,
    checked: result.checked,
  };
}

function presentSavedLinks(links: {
  readonly resolved: readonly SavedLink[];
  readonly pending: readonly SavedLink[];
}): Record<string, unknown> {
  return {
    resolved: links.resolved.map(presentSavedLink),
    pending: links.pending.map(presentSavedLink),
  };
}

function presentSavedLink(link: SavedLink): SavedLink {
  return {
    kind: link.kind,
    text: link.text,
    title: link.title,
    id: link.id,
    path: link.path,
    href: link.href,
    suggestions: link.suggestions.map((suggestion) => ({
      id: suggestion.id,
      path: suggestion.path,
      title: suggestion.title,
      score: suggestion.score,
    })),
  };
}
