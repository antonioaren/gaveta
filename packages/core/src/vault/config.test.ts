import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { formatDiagnostic, GavetaError } from '../errors.ts';
import {
  createDefaultVaultConfig,
  parseVaultConfig,
  readVaultConfig,
  writeVaultConfig,
} from './config.ts';
import { withTemp } from './fixture.ts';

const hint = formatDiagnostic('E_CONFIG_INVALID', { detail: 'x' }).hint;

const defaultConfig = {
  rel: {
    strict: false,
    vocabulary: ['related', 'depends-on', 'part-of', 'supersedes', 'references'],
  },
  remoteAllowlist: [] as string[],
};

function expectInvalid(value: unknown, detail: string): void {
  const formatted = formatDiagnostic('E_CONFIG_INVALID', { detail });
  expect(() => parseVaultConfig(value)).toThrow(GavetaError);
  expect(() => parseVaultConfig(value)).toThrow(
    expect.objectContaining({
      code: 'E_CONFIG_INVALID',
      message: formatted.message,
      hint: formatted.hint,
    }),
  );
}

it('returns a fresh default config each call', () => {
  const first = createDefaultVaultConfig();
  expect(first).toEqual(defaultConfig);
  first.rel.vocabulary.push('extra');
  first.rel.strict = true;
  first.remoteAllowlist.push('example.com');
  expect(createDefaultVaultConfig()).toEqual(defaultConfig);
});

it('rejects shapes that are not the vault config', () => {
  expectInvalid(null, 'la raíz tiene que ser un objeto');
  expectInvalid([], 'la raíz tiene que ser un objeto');
  expectInvalid('{}', 'la raíz tiene que ser un objeto');
  expectInvalid(
    { rel: defaultConfig.rel },
    'tiene que tener exactamente las claves rel y remoteAllowlist (assetsVersion, assets y commandLog son opcionales)',
  );
  expectInvalid(
    { ...defaultConfig, extra: true },
    'tiene que tener exactamente las claves rel y remoteAllowlist (assetsVersion, assets y commandLog son opcionales)',
  );
  expectInvalid({ rel: null, remoteAllowlist: [] }, 'rel tiene que ser un objeto');
  expectInvalid(
    { rel: { strict: false }, remoteAllowlist: [] },
    'rel tiene que tener exactamente las claves strict y vocabulary',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: [], extra: true }, remoteAllowlist: [] },
    'rel tiene que tener exactamente las claves strict y vocabulary',
  );
  expectInvalid(
    { rel: { strict: 'false', vocabulary: [] }, remoteAllowlist: [] },
    'rel.strict tiene que ser booleano',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: 'related' }, remoteAllowlist: [] },
    'rel.vocabulary tiene que ser una lista de textos',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: ['related', ''] }, remoteAllowlist: [] },
    'rel.vocabulary no admite textos vacíos ni espacios alrededor',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: [' related'] }, remoteAllowlist: [] },
    'rel.vocabulary no admite textos vacíos ni espacios alrededor',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: ['related', 'related'] }, remoteAllowlist: [] },
    'rel.vocabulary tiene duplicados',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: [] }, remoteAllowlist: 'example.com' },
    'remoteAllowlist tiene que ser una lista de textos',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: [] }, remoteAllowlist: [''] },
    'remoteAllowlist no admite textos vacíos ni espacios alrededor',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: [] }, remoteAllowlist: ['example.com', 'example.com'] },
    'remoteAllowlist tiene duplicados',
  );
  expectInvalid(
    { rel: { strict: false, vocabulary: [1] }, remoteAllowlist: [] },
    'rel.vocabulary tiene que ser una lista de textos',
  );
});

it('copies list fields so the caller cannot mutate the parsed config through the input', () => {
  const input = {
    rel: { strict: true, vocabulary: ['related'] },
    remoteAllowlist: ['example.com'],
  };
  const parsed = parseVaultConfig(input);
  parsed.rel.vocabulary.push('other');
  parsed.remoteAllowlist.push('other.test');
  expect(input.rel.vocabulary).toEqual(['related']);
  expect(input.remoteAllowlist).toEqual(['example.com']);
  expect(parsed.rel.strict).toBe(true);
});

it('writes canonical config.json atomically and reads it back', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(join(root, '.gaveta'), { recursive: true });
    const config = createDefaultVaultConfig();
    config.rel.strict = true;
    config.rel.vocabulary = ['related', 'parte-de'];
    config.remoteAllowlist = ['cdn.example'];

    await writeVaultConfig(root, config);
    await writeVaultConfig(root, config);

    const bytes = await readFile(join(root, '.gaveta', 'config.json'), 'utf8');
    expect(bytes).toBe(
      `${JSON.stringify(
        {
          rel: { strict: true, vocabulary: ['related', 'parte-de'] },
          remoteAllowlist: ['cdn.example'],
        },
        null,
        2,
      )}\n`,
    );
    expect(await readVaultConfig(root)).toEqual({
      rel: { strict: true, vocabulary: ['related', 'parte-de'] },
      remoteAllowlist: ['cdn.example'],
    });
  });
});

it('does not overwrite a valid config when the next write is rejected', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(join(root, '.gaveta'), { recursive: true });
    await writeVaultConfig(root, createDefaultVaultConfig());
    const before = await readFile(join(root, '.gaveta', 'config.json'), 'utf8');

    await expect(writeVaultConfig(root, { rel: { strict: false } })).rejects.toMatchObject({
      code: 'E_CONFIG_INVALID',
    });

    expect(await readFile(join(root, '.gaveta', 'config.json'), 'utf8')).toBe(before);
  });
});

it('reports a missing or unparsable config.json as E_CONFIG_INVALID', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(join(root, '.gaveta'), { recursive: true });

    await expect(readVaultConfig(root)).rejects.toMatchObject({
      code: 'E_CONFIG_INVALID',
      message: formatDiagnostic('E_CONFIG_INVALID', { detail: 'no existe .gaveta/config.json' })
        .message,
      hint,
    });

    await writeFile(join(root, '.gaveta', 'config.json'), '{');
    await expect(readVaultConfig(root)).rejects.toMatchObject({
      code: 'E_CONFIG_INVALID',
      message: formatDiagnostic('E_CONFIG_INVALID', { detail: 'no es JSON' }).message,
    });

    await writeFile(join(root, '.gaveta', 'config.json'), '{"rel":{}}\n');
    await expect(readVaultConfig(root)).rejects.toBeInstanceOf(GavetaError);
  });
});

it('accepts compact JSON and preserves an unknown-free custom vocabulary', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(join(root, '.gaveta'), { recursive: true });
    await writeFile(
      join(root, '.gaveta', 'config.json'),
      '{"remoteAllowlist":[],"rel":{"vocabulary":["references"],"strict":false}}',
    );

    expect(await readVaultConfig(root)).toEqual({
      rel: { strict: false, vocabulary: ['references'] },
      remoteAllowlist: [],
    });
  });
});

it('does not follow a config.json symlink that leaves the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const outside = join(parent, 'outside');
    await mkdir(join(root, '.gaveta'), { recursive: true });
    await mkdir(outside);
    const outsideFile = join(outside, 'config.json');
    await writeFile(outsideFile, '{"stolen":true}\n');
    await symlink(outsideFile, join(root, '.gaveta', 'config.json'));

    await expect(readVaultConfig(root)).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });

    await expect(writeVaultConfig(root, createDefaultVaultConfig())).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
    expect(await readFile(outsideFile, 'utf8')).toBe('{"stolen":true}\n');
  });
});

it('follows a .gaveta symlink that stays inside the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const inside = join(root, 'meta');
    await mkdir(inside, { recursive: true });
    await symlink('meta', join(root, '.gaveta'), 'dir');

    await writeVaultConfig(root, createDefaultVaultConfig());

    expect(await readVaultConfig(root)).toEqual(createDefaultVaultConfig());
    expect(await readFile(join(inside, 'config.json'), 'utf8')).toContain('"strict": false');
  });
});

it('rejects a .gaveta symlink that leaves the vault or does not resolve', async () => {
  await withTemp(async (parent) => {
    const escaped = join(parent, 'escaped');
    const dangling = join(parent, 'dangling');
    const outside = join(parent, 'outside');
    await mkdir(escaped);
    await mkdir(dangling);
    await mkdir(outside);
    await symlink(outside, join(escaped, '.gaveta'), 'dir');
    await symlink(join(dangling, 'missing'), join(dangling, '.gaveta'), 'dir');

    await expect(readVaultConfig(escaped)).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
    await expect(readVaultConfig(dangling)).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
    await expect(writeVaultConfig(escaped, createDefaultVaultConfig())).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
  });
});

it('rejects a .gaveta file and a symlink to a file', async () => {
  await withTemp(async (parent) => {
    const fileMarker = join(parent, 'file-marker');
    const linkMarker = join(parent, 'link-marker');
    await mkdir(fileMarker);
    await mkdir(linkMarker);
    await writeFile(join(fileMarker, '.gaveta'), 'no');
    await writeFile(join(linkMarker, 'note.txt'), 'x');
    await symlink('note.txt', join(linkMarker, '.gaveta'));

    await expect(readVaultConfig(fileMarker)).rejects.toMatchObject({ code: 'E_VAULT_NOT_FOUND' });
    await expect(readVaultConfig(linkMarker)).rejects.toMatchObject({ code: 'E_VAULT_NOT_FOUND' });
  });
});

it('fails with E_VAULT_NOT_FOUND when .gaveta does not exist', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'plain');
    await mkdir(root);

    await expect(writeVaultConfig(root, createDefaultVaultConfig())).rejects.toMatchObject({
      code: 'E_VAULT_NOT_FOUND',
    });
    await expect(readVaultConfig(root)).rejects.toMatchObject({ code: 'E_VAULT_NOT_FOUND' });
  });
});
