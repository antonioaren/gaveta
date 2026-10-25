import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { expect, it } from 'vitest';
import { CliFailure } from './failure.ts';
import { readCommandInput } from './input.ts';

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-cli-input-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function stdinFrom(contents: Buffer | string): Readable {
  return Readable.from([Buffer.isBuffer(contents) ? contents : Buffer.from(contents)]);
}

it('reads content from an argument', async () => {
  const input = await readCommandInput({
    from: undefined,
    argument: 'á',
    stdin: stdinFrom(''),
    cwd: '/tmp',
    required: false,
  });
  expect(input).toEqual({
    text: 'á',
    source: 'argument',
    bytes: Buffer.byteLength('á'),
    sha256: createHash('sha256').update('á').digest('hex'),
  });
});

it('reads a file relative to cwd without dropping bytes', async () => {
  await withTemp(async (directory) => {
    const outside = await mkdtemp(join(tmpdir(), 'gaveta-cli-outside-'));
    try {
      const file = join(outside, 'nota.html');
      const text = '<article>á</article>';
      await writeFile(file, text);
      const input = await readCommandInput({
        from: file,
        argument: undefined,
        stdin: stdinFrom('ignored'),
        cwd: directory,
        required: true,
      });
      expect(input?.source).toBe('file');
      expect(input?.text).toBe(text);
      expect(input?.bytes).toBe(Buffer.byteLength(text));
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

it('resolves a relative --from path against cwd', async () => {
  await withTemp(async (directory) => {
    await writeFile(join(directory, 'nota.html'), '<p>ok</p>');
    const nested = join(directory, 'nested');
    await mkdir(nested);
    const input = await readCommandInput({
      from: '../nota.html',
      argument: undefined,
      stdin: stdinFrom(''),
      cwd: nested,
      required: true,
    });
    expect(input?.text).toBe('<p>ok</p>');
  });
});

it('reads 1 MiB from stdin without loss', async () => {
  const payload = Buffer.alloc(1024 * 1024, 0x61);
  const input = await readCommandInput({
    from: '-',
    argument: undefined,
    stdin: stdinFrom(payload),
    cwd: '/tmp',
    required: true,
  });
  expect(input?.source).toBe('stdin');
  expect(input?.bytes).toBe(payload.length);
  expect(input?.text).toBe(payload.toString('utf8'));
  expect(input?.sha256).toBe(createHash('sha256').update(payload).digest('hex'));
});

it('rejects argument and --from together', async () => {
  await expect(
    readCommandInput({
      from: '-',
      argument: 'hola',
      stdin: stdinFrom('hola'),
      cwd: '/tmp',
      required: true,
    }),
  ).rejects.toMatchObject({
    name: 'CliFailure',
    code: 'E_ARG_INVALID',
    details: { problem: 'cli.auto.el_contenido_se_indica_por_argumento_o_por_from_' },
  });
});

it('rejects a missing file, a directory, a null byte, and a flag-like path', async () => {
  await withTemp(async (directory) => {
    await expect(
      readCommandInput({
        from: join(directory, 'missing.html'),
        argument: undefined,
        stdin: stdinFrom(''),
        cwd: directory,
        required: true,
      }),
    ).rejects.toBeInstanceOf(CliFailure);

    await expect(
      readCommandInput({
        from: directory,
        argument: undefined,
        stdin: stdinFrom(''),
        cwd: directory,
        required: true,
      }),
    ).rejects.toMatchObject({ code: 'E_ARG_INVALID' });

    await expect(
      readCommandInput({
        from: 'bad\0file',
        argument: undefined,
        stdin: stdinFrom(''),
        cwd: directory,
        required: true,
      }),
    ).rejects.toMatchObject({ code: 'E_ARG_INVALID' });

    await expect(
      readCommandInput({
        from: '--json',
        argument: undefined,
        stdin: stdinFrom(''),
        cwd: directory,
        required: true,
      }),
    ).rejects.toMatchObject({
      code: 'E_ARG_INVALID',
      details: { problem: 'cli.auto.la_ruta_de_from_no_puede_empezar_por' },
    });
  });
});

it('returns null when input is optional and absent, and fails when it is required', async () => {
  await expect(
    readCommandInput({
      from: undefined,
      argument: undefined,
      stdin: stdinFrom(''),
      cwd: '/tmp',
      required: false,
    }),
  ).resolves.toBeNull();

  await expect(
    readCommandInput({
      from: undefined,
      argument: undefined,
      stdin: stdinFrom(''),
      cwd: '/tmp',
      required: true,
    }),
  ).rejects.toMatchObject({
    code: 'E_ARG_INVALID',
    details: {
      problem: 'cli.auto.falta_el_contenido_pasalo_como_argumento_con_fro',
    },
  });
});
