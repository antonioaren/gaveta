import {
  ABSENT_NOTE_HASH,
  addTaskToNote,
  checkTask,
  createNote,
  editNote,
  GavetaError,
  isNoteType,
  isIso8601,
  isTaskPriority,
  linkNote,
  moveNote,
  readNote,
  removeNote,
  requireNoteContentHash,
  uncheckTask,
  type ToggleTaskResult,
} from '@gaveta/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { apiSuccess } from './envelope.ts';
import type { VaultIndexSession } from './vault-index.ts';
import {
  assertAllowedKeys,
  optionalBooleanField,
  optionalStringField,
  optionalStringListField,
  readJsonObjectBody,
  requiredStringField,
} from './write-body.ts';
import { assertNoteWriteOk, mapNoteWarnings } from './write-gate.ts';
import { readWriteIfMatch } from './write-if-match.ts';
import {
  presentCreatedNote,
  presentEditedNote,
  presentLinkedNote,
  presentMovedNote,
  presentRemovedNote,
  presentTaskMutation,
} from './write-present.ts';

export interface WriteRoutesOptions {
  readonly vaultRoot: string;
}

export function registerWriteRoutes(
  app: FastifyInstance,
  options: WriteRoutesOptions,
  vaultSession: VaultIndexSession,
): void {
  app.post('/api/new', async (request, reply) => {
    const body = readJsonObjectBody(request);
    assertAllowedKeys(body, [
      'title',
      'type',
      'in',
      'tags',
      'aliases',
      'html',
      'id',
      'now',
      'ifMatch',
    ]);
    const ifMatch = readWriteIfMatch(request, body);
    requireNoteContentHash(ABSENT_NOTE_HASH, ifMatch);
    const created = await createNote({
      vaultRoot: options.vaultRoot,
      title: requiredStringField(body, 'title'),
      type: readNoteType(body),
      folder: optionalStringField(body, 'in'),
      tags: optionalStringListField(body, 'tags'),
      aliases: optionalStringListField(body, 'aliases'),
      html: readOptionalHtml(body),
      id: optionalStringField(body, 'id'),
      now: readOptionalNow(body),
    });
    assertNoteWriteOk(created);
    if (!created.ok) {
      throw new GavetaError('E_HTML_INVALID');
    }
    return reply.send(apiSuccess(presentCreatedNote(created), mapNoteWarnings(created.warnings)));
  });

  app.post('/api/edit', async (request, reply) => {
    const body = readJsonObjectBody(request);
    assertAllowedKeys(body, ['ref', 'mode', 'section', 'html', 'ifMatch']);
    const ref = requiredStringField(body, 'ref');
    const ifMatch = readWriteIfMatch(request, body);
    await assertRefIfMatch(options.vaultRoot, ref, ifMatch);
    const mode = readEditMode(body);
    const edited = await editNote({
      vaultRoot: options.vaultRoot,
      ref,
      html: requiredStringField(body, 'html'),
      mode,
      section: readEditSection(body, mode),
      ifMatch,
    });
    assertNoteWriteOk(edited);
    if (!edited.ok) {
      throw new GavetaError('E_HTML_INVALID');
    }
    return reply.send(apiSuccess(presentEditedNote(edited), mapNoteWarnings(edited.warnings)));
  });

  app.post('/api/link', async (request, reply) => {
    const body = readJsonObjectBody(request);
    assertAllowedKeys(body, ['from', 'to', 'rel', 'text', 'section', 'ifMatch']);
    const from = requiredStringField(body, 'from');
    const ifMatch = readWriteIfMatch(request, body);
    await assertRefIfMatch(options.vaultRoot, from, ifMatch);
    const linked = await linkNote({
      vaultRoot: options.vaultRoot,
      from,
      to: requiredStringField(body, 'to'),
      rel: readOptionalRel(body),
      text: optionalStringField(body, 'text'),
      section: optionalStringField(body, 'section'),
      ifMatch,
    });
    assertNoteWriteOk(linked);
    if (!linked.ok) {
      throw new GavetaError('E_HTML_INVALID');
    }
    return reply.send(apiSuccess(presentLinkedNote(linked), mapNoteWarnings(linked.warnings)));
  });

  app.post('/api/mv', async (request, reply) => {
    const body = readJsonObjectBody(request);
    assertAllowedKeys(body, ['ref', 'destination', 'ifMatch']);
    const ref = requiredStringField(body, 'ref');
    const ifMatch = readWriteIfMatch(request, body);
    await assertRefIfMatch(options.vaultRoot, ref, ifMatch);
    const destination = requiredStringField(body, 'destination');
    const { result, warnings } = await vaultSession.withIndex(async (index) => {
      const moved = await moveNote(index, ref, destination);
      return moved;
    });
    return reply.send(apiSuccess(presentMovedNote(result), warnings));
  });

  app.post('/api/rm', async (request, reply) => {
    const body = readJsonObjectBody(request);
    assertAllowedKeys(body, ['ref', 'force', 'ifMatch']);
    const ref = requiredStringField(body, 'ref');
    const ifMatch = readWriteIfMatch(request, body);
    await assertRefIfMatch(options.vaultRoot, ref, ifMatch);
    const force = optionalBooleanField(body, 'force') ?? false;
    const { result, warnings } = await vaultSession.withIndex(async (index) => {
      const removed = await removeNote(index, ref, { force });
      return removed;
    });
    return reply.send(apiSuccess(presentRemovedNote(result), warnings));
  });

  app.post('/api/todo/add', async (request, reply) => {
    return handleTaskAdd(request, reply, options);
  });

  app.post('/api/todo/check', async (request, reply) => {
    return handleTaskToggle(request, reply, options, checkTask);
  });

  app.post('/api/todo/uncheck', async (request, reply) => {
    return handleTaskToggle(request, reply, options, uncheckTask);
  });
}

async function handleTaskAdd(
  request: FastifyRequest,
  reply: FastifyReply,
  options: WriteRoutesOptions,
): Promise<FastifyReply> {
  const body = readJsonObjectBody(request);
  assertAllowedKeys(body, ['ref', 'text', 'section', 'due', 'priority', 'ifMatch']);
  const ref = requiredStringField(body, 'ref');
  const ifMatch = readWriteIfMatch(request, body);
  await assertRefIfMatch(options.vaultRoot, ref, ifMatch);
  const result = await addTaskToNote({
    vaultRoot: options.vaultRoot,
    ref,
    text: requiredStringField(body, 'text'),
    section: optionalStringField(body, 'section'),
    due: readOptionalDue(body),
    priority: readOptionalPriority(body),
    ifMatch,
  });
  assertNoteWriteOk(result);
  if (!result.ok) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return reply.send(apiSuccess(presentTaskMutation(result), mapNoteWarnings(result.warnings)));
}

async function handleTaskToggle(
  request: FastifyRequest,
  reply: FastifyReply,
  options: WriteRoutesOptions,
  toggle: (options: unknown) => Promise<ToggleTaskResult>,
): Promise<FastifyReply> {
  const body = readJsonObjectBody(request);
  assertAllowedKeys(body, ['ref', 'taskId', 'ifMatch']);
  const ref = requiredStringField(body, 'ref');
  const ifMatch = readWriteIfMatch(request, body);
  await assertRefIfMatch(options.vaultRoot, ref, ifMatch);
  const result = await toggle({
    vaultRoot: options.vaultRoot,
    ref,
    taskId: requiredStringField(body, 'taskId'),
    ifMatch,
  });
  assertNoteWriteOk(result);
  if (!result.ok) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return reply.send(apiSuccess(presentTaskMutation(result), mapNoteWarnings(result.warnings)));
}

async function assertRefIfMatch(
  vaultRoot: string,
  ref: string,
  ifMatch: string | undefined,
): Promise<void> {
  const note = await readNote({ vaultRoot, ref, as: 'html' });
  requireNoteContentHash(note.hash, ifMatch);
}

function readNoteType(body: Record<string, unknown>): string {
  const type = requiredStringField(body, 'type');
  if (!isNoteType(type)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return type;
}

function readOptionalHtml(body: Record<string, unknown>): string | undefined {
  if (!Object.hasOwn(body, 'html')) {
    return undefined;
  }
  const value = body.html;
  if (value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

type EditMode = 'replace' | 'append' | 'prepend';

function readEditMode(body: Record<string, unknown>): EditMode {
  const mode = requiredStringField(body, 'mode');
  if (mode !== 'replace' && mode !== 'append' && mode !== 'prepend') {
    throw new GavetaError('E_ARG_INVALID');
  }
  return mode;
}

function readEditSection(body: Record<string, unknown>, mode: EditMode): string | undefined {
  const section = optionalStringField(body, 'section');
  if (section === undefined) {
    if (mode !== 'replace') {
      throw new GavetaError('E_ARG_INVALID');
    }
    return undefined;
  }
  if (section !== section.trim()) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return section;
}

function readOptionalRel(body: Record<string, unknown>): string | null | undefined {
  if (!Object.hasOwn(body, 'rel')) {
    return undefined;
  }
  const value = body.rel;
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value.trim();
}

function readOptionalDue(body: Record<string, unknown>): string | undefined {
  const due = optionalStringField(body, 'due');
  if (due === undefined) {
    return undefined;
  }
  if (!isIso8601(due)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return due;
}

function readOptionalNow(body: Record<string, unknown>): string | undefined {
  const now = optionalStringField(body, 'now');
  if (now === undefined) {
    return undefined;
  }
  if (!isIso8601(now)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return now;
}

function readOptionalPriority(body: Record<string, unknown>): string | undefined {
  const priority = optionalStringField(body, 'priority');
  if (priority === undefined) {
    return undefined;
  }
  if (!isTaskPriority(priority)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return priority;
}
