import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  GavetaError,
  createDefaultVaultConfig,
  diagnosticCodes,
  exitCodeFor,
  formatDiagnostic,
  isErrorCode,
  isWarningCode,
  writeVaultConfig,
} from '@gaveta/core';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderHelp } from './help.ts';
import { commands } from './registry.ts';
import { runCli, type CliIo } from './run.ts';
import type { CommandSpec } from './types.ts';

const cliVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string };

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-cli-run-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function capture(overrides: Omit<CliIo, 'stdout' | 'stderr'> = {}): {
  io: CliIo;
  stdout: () => string;
  stderr: () => string;
} {
  let out = '';
  let err = '';
  return {
    io: {
      ...overrides,
      stdout(chunk: string) {
        out += chunk;
      },
      stderr(chunk: string) {
        err += chunk;
      },
    },
    stdout: () => out,
    stderr: () => err,
  };
}

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

async function makeVault(parent: string, name: string): Promise<string> {
  const root = join(parent, name);
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  return root;
}

it('prints the human version by default and the JSON envelope with --json', async () => {
  await withTemp(async (directory) => {
    const human = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('version'), human.io)).toBe(EXIT_CODES.ok);
    expect(human.stdout()).toBe(`gaveta ${cliVersion.version}\n`);
    expect(human.stderr()).toBe('');

    const json = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('version', '--json'), json.io)).toBe(EXIT_CODES.ok);
    expect(json.stderr()).toBe('');
    expect(JSON.parse(json.stdout())).toEqual({
      ok: true,
      schemaVersion: 1,
      command: 'version',
      data: {
        name: 'gaveta',
        version: cliVersion.version,
        vault: null,
        input: null,
      },
      warnings: [],
    });
    expect(await runCli(argv('--json', 'version'), capture({ cwd: directory, env: {} }).io)).toBe(
      EXIT_CODES.ok,
    );
    const flagged = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('-V', '--json'), flagged.io)).toBe(EXIT_CODES.ok);
    expect(flagged.stdout()).toBe(json.stdout());
    const longFlag = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('--version'), longFlag.io)).toBe(EXIT_CODES.ok);
    expect(longFlag.stdout()).toBe(human.stdout());
  });
});

it('shows Spanish help when there is no command and a JSON error when --json has no command', async () => {
  await withTemp(async (directory) => {
    const help = capture({ cwd: directory, env: {} });
    expect(await runCli(argv(), help.io)).toBe(EXIT_CODES.ok);
    expect(help.stdout()).toBe(renderHelp(commands));
    expect(help.stderr()).toBe('');
    expect(help.stdout()).not.toContain('unknown command');

    const versionHelp = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('version', '--help'), versionHelp.io)).toBe(EXIT_CODES.ok);
    expect(versionHelp.stdout()).toBe(renderHelp(commands, 'version'));

    const missing = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('--json'), missing.io)).toBe(EXIT_CODES.usage);
    const body = JSON.parse(missing.stdout()) as {
      error: { code: string; message: string; hint: string };
    };
    expect(body.error.code).toBe('E_ARG_INVALID');
    expect(body.error.message).toBe(formatDiagnostic('E_ARG_INVALID').message);
    expect(body.error.hint).toBe(formatDiagnostic('E_ARG_INVALID').hint);
    expect(missing.stderr()).toBe('');
  });
});

it('reports unknown commands and options as usage errors without English commander text', async () => {
  await withTemp(async (directory) => {
    const human = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('nope'), human.io)).toBe(EXIT_CODES.usage);
    expect(human.stdout()).toBe('');
    expect(human.stderr()).toContain('E_ARG_INVALID:');
    expect(human.stderr()).toContain(formatDiagnostic('E_ARG_INVALID').message);
    expect(human.stderr()).toContain('El comando no existe.');
    expect(human.stderr()).toContain('Uso: gaveta');
    expect(human.stderr().toLowerCase()).not.toContain('unknown command');

    const json = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('--json', 'nope'), json.io)).toBe(EXIT_CODES.usage);
    expect(json.stderr()).toBe('');
    const body = JSON.parse(json.stdout()) as {
      ok: boolean;
      command: string;
      error: { code: string; details?: { problem?: string } };
    };
    expect(body.ok).toBe(false);
    expect(body.command).toBe('nope');
    expect(body.error.code).toBe('E_ARG_INVALID');
    expect(body.error.details?.problem).toBe('El comando no existe.');

    const option = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('version', '--unknown'), option.io)).toBe(EXIT_CODES.usage);
    expect(option.stderr()).toContain('La opción no existe.');
    expect(option.stderr().toLowerCase()).not.toContain('unknown option');

    const extra = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('version', 'extra'), extra.io)).toBe(EXIT_CODES.usage);
    expect(extra.stderr()).toContain('Sobran argumentos.');
  });
});

it('resolves --vault, GAVETA_VAULT, and an upward search, with --vault first', async () => {
  await withTemp(async (parent) => {
    const byOption = await makeVault(parent, 'by-option');
    const byEnv = await makeVault(parent, 'by-env');
    const byWalk = await makeVault(parent, 'by-walk');
    const nested = join(byWalk, 'nested');
    await mkdir(nested);
    const elsewhere = join(parent, 'elsewhere');
    await mkdir(elsewhere);

    const option = capture({ cwd: elsewhere, env: { GAVETA_VAULT: byEnv } });
    expect(await runCli(argv('version', '--json', '--vault', byOption), option.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(JSON.parse(option.stdout())).toMatchObject({
      data: { vault: { root: await realpath(byOption), source: 'option' } },
    });

    const env = capture({ cwd: elsewhere, env: { GAVETA_VAULT: byEnv } });
    expect(await runCli(argv('--json', 'version'), env.io)).toBe(EXIT_CODES.ok);
    expect(JSON.parse(env.stdout())).toMatchObject({
      data: { vault: { root: await realpath(byEnv), source: 'env' } },
    });

    const walked = capture({ cwd: nested, env: {} });
    expect(await runCli(argv('version', '--json'), walked.io)).toBe(EXIT_CODES.ok);
    expect(JSON.parse(walked.stdout())).toMatchObject({
      data: { vault: { root: await realpath(byWalk), source: 'search' } },
    });

    const relative = capture({ cwd: elsewhere, env: {} });
    expect(await runCli(argv('version', '--json', '--vault', '../by-walk'), relative.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(JSON.parse(relative.stdout())).toMatchObject({
      data: { vault: { root: await realpath(byWalk), source: 'option' } },
    });

    const missing = capture({ cwd: nested, env: { GAVETA_VAULT: byWalk } });
    expect(
      await runCli(argv('version', '--json', '--vault', join(parent, 'missing')), missing.io),
    ).toBe(EXIT_CODES.notFound);
    expect(JSON.parse(missing.stdout())).toMatchObject({
      command: 'version',
      error: {
        code: 'E_VAULT_NOT_FOUND',
        message: formatDiagnostic('E_VAULT_NOT_FOUND').message,
        hint: formatDiagnostic('E_VAULT_NOT_FOUND').hint,
      },
    });
    expect(missing.stderr()).toBe('');

    const emptyEnv = capture({ cwd: nested, env: { GAVETA_VAULT: '' } });
    expect(await runCli(argv('version', '--json'), emptyEnv.io)).toBe(EXIT_CODES.ok);
    expect(JSON.parse(emptyEnv.stdout())).toMatchObject({
      data: { vault: { source: 'search' } },
    });
  });
});

it('still prints the version when the discovered vault has a broken config', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    await writeFile(join(vault, GAVETA_DIRECTORY, 'config.json'), '{', 'utf8');
    const captured = capture({ cwd: vault, env: {} });
    expect(await runCli(argv('version'), captured.io)).toBe(EXIT_CODES.ok);
    expect(captured.stdout()).toBe(`gaveta ${cliVersion.version}\n`);
  });
});

it('surfaces a .gaveta symlink that leaves the directory as E_PATH_OUTSIDE_VAULT', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const child = join(vault, 'child');
    const outside = join(parent, 'outside-marker');
    await mkdir(child);
    await mkdir(outside);
    await writeFile(join(outside, 'secret.txt'), 'TOP-SECRET');
    await symlink(outside, join(child, GAVETA_DIRECTORY), 'dir');

    const captured = capture({ cwd: child, env: {} });
    expect(await runCli(argv('version', '--json'), captured.io)).toBe(EXIT_CODES.usage);
    expect(captured.stdout()).not.toContain('TOP-SECRET');
    expect(captured.stderr()).not.toContain('TOP-SECRET');
    expect(JSON.parse(captured.stdout())).toMatchObject({
      error: {
        code: 'E_PATH_OUTSIDE_VAULT',
        message: formatDiagnostic('E_PATH_OUTSIDE_VAULT').message,
        hint: formatDiagnostic('E_PATH_OUTSIDE_VAULT').hint,
      },
    });
  });
});

it('hashes stdin and --from files on the version command', async () => {
  await withTemp(async (directory) => {
    const payload = Buffer.alloc(1024 * 1024, 0x61);
    const stdin = capture({
      cwd: directory,
      env: {},
      stdin: Readable.from([payload]),
    });
    expect(await runCli(argv('version', '--json', '--from', '-'), stdin.io)).toBe(EXIT_CODES.ok);
    expect(JSON.parse(stdin.stdout())).toMatchObject({
      data: {
        input: {
          source: 'stdin',
          bytes: payload.length,
          sha256: createHash('sha256').update(payload).digest('hex'),
        },
      },
    });

    await writeFile(join(directory, 'nota.html'), '<article>hola</article>');
    const file = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('version', '--json', '--from', 'nota.html'), file.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(JSON.parse(file.stdout())).toMatchObject({
      data: {
        input: {
          source: 'file',
          bytes: Buffer.byteLength('<article>hola</article>'),
          sha256: createHash('sha256').update('<article>hola</article>').digest('hex'),
        },
      },
    });

    const missing = capture({ cwd: directory, env: {} });
    expect(await runCli(argv('version', '--from', 'missing.html'), missing.io)).toBe(
      EXIT_CODES.usage,
    );
    expect(missing.stdout()).toBe('');
    expect(missing.stderr()).toContain('E_ARG_INVALID:');
    expect(missing.stderr()).toContain('No se ha podido leer el archivo.');
  });
});

it.each(diagnosticCodes().filter(isErrorCode))(
  'maps thrown %s onto the catalog exit code and envelope',
  async (code) => {
    const command: CommandSpec = {
      name: 'boom',
      summary: 'Falla a propósito.',
      example: 'gaveta boom',
      requiresVault: false,
      input: 'none',
      run() {
        throw new GavetaError(code);
      },
    };
    await withTemp(async (directory) => {
      const captured = capture({ cwd: directory, env: {}, registry: [command] });
      const status = await runCli(argv('--json', 'boom'), captured.io);
      expect(status).toBe(exitCodeFor(code));
      expect(JSON.parse(captured.stdout())).toEqual({
        ok: false,
        schemaVersion: 1,
        command: 'boom',
        error: {
          code,
          message: formatDiagnostic(code).message,
          hint: formatDiagnostic(code).hint,
        },
      });
    });
  },
);

it.each(diagnosticCodes().filter((code) => isWarningCode(code)))(
  'keeps %s as a warning with exit 0 when it does not escalate',
  async (code) => {
    const command: CommandSpec = {
      name: 'warn',
      summary: 'Avisa.',
      example: 'gaveta warn',
      requiresVault: false,
      input: 'none',
      run() {
        return {
          data: { ok: true },
          human: 'listo\n',
          warnings: [{ code, params: code === 'W_INLINE_STYLE_REMOVED' ? { count: 2 } : {} }],
        };
      },
    };
    await withTemp(async (directory) => {
      const captured = capture({ cwd: directory, env: {}, registry: [command] });
      expect(await runCli(argv('--json', 'warn'), captured.io)).toBe(EXIT_CODES.ok);
      const formatted = formatDiagnostic(
        code,
        code === 'W_INLINE_STYLE_REMOVED' ? { count: 2 } : {},
      );
      expect(JSON.parse(captured.stdout())).toMatchObject({
        ok: true,
        warnings: [{ code, message: formatted.message, hint: formatted.hint }],
      });
    });
  },
);

it('escalates W_REL_UNKNOWN when the vault config is strict and reads that config only if the command needs a vault', async () => {
  const command: CommandSpec = {
    name: 'warn',
    summary: 'Avisa.',
    example: 'gaveta warn',
    requiresVault: true,
    input: 'none',
    run() {
      return {
        data: {},
        human: 'listo\n',
        warnings: [{ code: 'W_REL_UNKNOWN' }],
      };
    },
  };

  await withTemp(async (parent) => {
    const strict = await makeVault(parent, 'strict');
    const config = createDefaultVaultConfig();
    config.rel.strict = true;
    await writeVaultConfig(strict, config);
    const failed = capture({ cwd: strict, env: {}, registry: [command] });
    expect(await runCli(argv('--json', 'warn'), failed.io)).toBe(EXIT_CODES.validation);
    expect(JSON.parse(failed.stdout())).toMatchObject({
      ok: false,
      error: {
        code: 'W_REL_UNKNOWN',
        message: formatDiagnostic('W_REL_UNKNOWN').message,
        hint: formatDiagnostic('W_REL_UNKNOWN').hint,
      },
    });

    const loose = await makeVault(parent, 'loose');
    await writeVaultConfig(loose, createDefaultVaultConfig());
    const passed = capture({ cwd: loose, env: {}, registry: [command] });
    expect(await runCli(argv('warn'), passed.io)).toBe(EXIT_CODES.ok);
    expect(passed.stdout()).toBe('listo\n');
    expect(passed.stderr()).toContain('W_REL_UNKNOWN:');

    const broken = await makeVault(parent, 'broken');
    await writeFile(join(broken, GAVETA_DIRECTORY, 'config.json'), '{', 'utf8');
    const invalid = capture({ cwd: broken, env: {}, registry: [command] });
    expect(await runCli(argv('--json', 'warn'), invalid.io)).toBe(EXIT_CODES.validation);
    expect(JSON.parse(invalid.stdout())).toMatchObject({
      error: { code: 'E_CONFIG_INVALID' },
    });

    const absent = capture({ cwd: parent, env: {}, registry: [command] });
    expect(await runCli(argv('warn'), absent.io)).toBe(EXIT_CODES.notFound);
    expect(absent.stderr()).toContain('E_VAULT_NOT_FOUND:');
    expect(absent.stdout()).toBe('');
  });
});

it('reads content from an argument on a command that accepts it', async () => {
  const command: CommandSpec = {
    name: 'echo',
    summary: 'Devuelve el contenido.',
    example: 'gaveta echo --from -',
    requiresVault: false,
    input: 'required',
    contentArgument: {
      name: 'contenido',
      description: 'Contenido de la nota.',
      required: false,
    },
    run(context) {
      return {
        data: { text: context.input?.text ?? null, source: context.input?.source ?? null },
        human: `${context.input?.text ?? ''}\n`,
      };
    },
  };

  await withTemp(async (directory) => {
    const captured = capture({ cwd: directory, env: {}, registry: [command] });
    expect(await runCli(argv('--json', 'echo', 'hola'), captured.io)).toBe(EXIT_CODES.ok);
    expect(JSON.parse(captured.stdout())).toMatchObject({
      data: { text: 'hola', source: 'argument' },
    });

    const both = capture({ cwd: directory, env: {}, registry: [command] });
    expect(await runCli(argv('echo', 'hola', '--from', '-'), both.io)).toBe(EXIT_CODES.usage);
    expect(both.stderr()).toContain('no por los dos');

    const none = capture({ cwd: directory, env: {}, registry: [command] });
    expect(await runCli(argv('echo'), none.io)).toBe(EXIT_CODES.usage);
    expect(none.stderr()).toContain('Falta el contenido');
  });
});

it('hides unexpected failures behind exit 5 and a Spanish message', async () => {
  const command: CommandSpec = {
    name: 'boom',
    summary: 'Rompe.',
    example: 'gaveta boom',
    requiresVault: false,
    input: 'none',
    run() {
      throw new Error('secret-path /etc/passwd');
    },
  };
  await withTemp(async (directory) => {
    const captured = capture({ cwd: directory, env: {}, registry: [command] });
    expect(await runCli(argv('--json', 'boom'), captured.io)).toBe(EXIT_CODES.internal);
    const body = JSON.parse(captured.stdout()) as {
      error: { code: string; message: string; hint: string };
    };
    expect(body.error.code).toBe('E_INTERNAL');
    expect(body.error.message).toBe('Ha ocurrido un error interno.');
    expect(body.error.hint.length).toBeGreaterThan(0);
    expect(captured.stdout()).not.toContain('secret-path');
    expect(captured.stdout()).not.toContain('passwd');
    expect(captured.stderr()).toBe('');
  });
});
