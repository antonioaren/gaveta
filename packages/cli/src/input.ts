import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import type { Readable } from 'node:stream';
import { CliFailure } from './failure.ts';
import type { InputSource, ResolvedInput } from './types.ts';

const BOTH_SOURCES = 'cli.auto.el_contenido_se_indica_por_argumento_o_por_from_';
const MISSING_CONTENT = 'cli.auto.falta_el_contenido_pasalo_como_argumento_con_fro';
const BAD_FROM_FLAG = 'cli.auto.la_ruta_de_from_no_puede_empezar_por';
const BAD_FROM_PATH = 'cli.auto.la_ruta_de_from_no_es_valida';
const UNREADABLE = 'cli.auto.no_se_ha_podido_leer_el_archivo';

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
  return await buffer(stdin);
}

function toInput(buffer: Buffer, source: InputSource): ResolvedInput {
  return {
    text: buffer.toString('utf8'),
    source,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}
