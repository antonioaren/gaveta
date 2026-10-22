import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { CliFailure } from './failure.ts';
import type { InputSource, ResolvedInput } from './types.ts';

const BOTH_SOURCES = 'El contenido se indica por argumento o por --from, no por los dos.';
const MISSING_CONTENT =
  'Falta el contenido: pásalo como argumento, con --from <archivo> o con --from -.';
const BAD_FROM_FLAG = 'La ruta de --from no puede empezar por -.';
const BAD_FROM_PATH = 'La ruta de --from no es válida.';
const UNREADABLE = 'No se ha podido leer el archivo.';

export async function readCommandInput(options: {
  readonly from: string | undefined;
  readonly argument: string | undefined;
  readonly stdin: Readable;
  readonly cwd: string;
  readonly required: boolean;
}): Promise<ResolvedInput | null> {
  if (options.from !== undefined && options.argument !== undefined) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BOTH_SOURCES });
  }
  if (options.from === '-') {
    return toInput(await readStdin(options.stdin), 'stdin');
  }
  if (options.from !== undefined) {
    return readFileInput(options.from, options.cwd);
  }
  if (options.argument !== undefined) {
    return toInput(Buffer.from(options.argument), 'argument');
  }
  if (options.required) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: MISSING_CONTENT });
  }
  return null;
}

async function readFileInput(from: string, cwd: string): Promise<ResolvedInput> {
  if (from.startsWith('-')) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_FROM_FLAG });
  }
  if (from.includes('\0') || cwd.includes('\0')) {
    throw new CliFailure('E_ARG_INVALID', {}, { problem: BAD_FROM_PATH });
  }
  const file = path.resolve(cwd, from);
  try {
    const info = await stat(file);
    if (!info.isFile()) {
      throw new CliFailure('E_ARG_INVALID', {}, { problem: UNREADABLE });
    }
    return toInput(await readFile(file), 'file');
  } catch (error) {
    if (error instanceof CliFailure) {
      throw error;
    }
    throw new CliFailure('E_ARG_INVALID', {}, { problem: UNREADABLE });
  }
}

async function readStdin(stdin: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(asBuffer(chunk));
  }
  return Buffer.concat(chunks);
}

function asBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === 'string') {
    return Buffer.from(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  throw new CliFailure('E_ARG_INVALID', {}, { problem: 'No se ha podido leer stdin.' });
}

function toInput(buffer: Buffer, source: InputSource): ResolvedInput {
  return {
    text: buffer.toString('utf8'),
    source,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
