import { apiJson } from '../api/client.ts';
import type { CreateNoteType } from './note-types.ts';
import { ABSENT_NOTE_HASH } from './absent-note-hash.ts';

export interface CreatedNoteView {
  readonly id: string;
  readonly path: string;
  readonly hash: string;
  readonly title: string;
  readonly type: string;
}

export interface CreateNoteRequest {
  readonly title: string;
  readonly type: CreateNoteType;
  readonly folder: string;
  readonly tags: readonly string[];
  readonly id?: string;
  readonly now?: string;
}

export async function createNoteViaApi(body: CreateNoteRequest): Promise<CreatedNoteView> {
  const payload: Record<string, unknown> = {
    title: body.title,
    type: body.type,
    ifMatch: ABSENT_NOTE_HASH,
  };
  if (body.tags.length > 0) {
    payload.tags = body.tags.join(',');
  }
  if (body.folder.length > 0) {
    payload.in = body.folder;
  }
  if (body.id !== undefined) {
    payload.id = body.id;
  }
  if (body.now !== undefined) {
    payload.now = body.now;
  }
  const envelope = await apiJson<CreatedNoteView>('/api/new', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return envelope.data;
}
