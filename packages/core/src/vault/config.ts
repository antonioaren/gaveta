import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { SUGGESTED_REL } from '../contract.ts';
import { GAVETA_DIRECTORY, VAULT_CONFIG_PATH } from './constants.ts';
import { configInvalid, pathOutsideVault, vaultNotFound } from './errors.ts';
import { hasNodeErrorCode } from './node-error.ts';
import { isInsideVault, readVaultText, writeVaultText } from './paths.ts';

export interface VaultConfig {
  rel: {
    strict: boolean;
    vocabulary: string[];
  };
  remoteAllowlist: string[];
  assetsVersion?: string;
  /** sha256 hex of last gaveta-written content per vault asset path */
  assets?: Record<string, string>;
  /** Optional local command log for `gaveta stats` (`.gaveta/log.jsonl`). */
  commandLog?: {
    readonly enabled: boolean;
  };
}

export function createDefaultVaultConfig(assetsVersion?: string): VaultConfig {
  return {
    rel: {
      strict: false,
      vocabulary: [...SUGGESTED_REL],
    },
    remoteAllowlist: [],
    ...(assetsVersion !== undefined ? { assetsVersion } : {}),
  };
}

export function parseVaultConfig(value: unknown): VaultConfig {
  if (!isRecord(value)) {
    throw configInvalid('la raíz tiene que ser un objeto');
  }
  assertAllowedKeys(
    value,
    ['rel', 'remoteAllowlist'],
    ['assetsVersion', 'assets', 'commandLog'],
    'tiene que tener exactamente las claves rel y remoteAllowlist (assetsVersion, assets y commandLog son opcionales)',
  );
  const rel = value.rel;
  if (!isRecord(rel)) {
    throw configInvalid('rel tiene que ser un objeto');
  }
  assertExactKeys(
    rel,
    ['strict', 'vocabulary'],
    'rel tiene que tener exactamente las claves strict y vocabulary',
  );
  if (typeof rel.strict !== 'boolean') {
    throw configInvalid('rel.strict tiene que ser booleano');
  }
  let assetsVersion: string | undefined;
  if ('assetsVersion' in value) {
    if (typeof value.assetsVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.assetsVersion)) {
      throw configInvalid('assetsVersion tiene que ser un texto SemVer (por ejemplo 0.1.0)');
    }
    assetsVersion = value.assetsVersion;
  }
  let assets: Record<string, string> | undefined;
  if ('assets' in value) {
    assets = parseAssetHashes(value.assets);
  }
  let commandLog: VaultConfig['commandLog'];
  if ('commandLog' in value) {
    commandLog = parseCommandLogConfig(value.commandLog);
  }
  const parsed: VaultConfig = {
    rel: {
      strict: rel.strict,
      vocabulary: parseStringList(
        rel.vocabulary,
        'rel.vocabulary tiene que ser una lista de textos',
        'rel.vocabulary no admite textos vacíos ni espacios alrededor',
        'rel.vocabulary tiene duplicados',
      ),
    },
    remoteAllowlist: parseStringList(
      value.remoteAllowlist,
      'remoteAllowlist tiene que ser una lista de textos',
      'remoteAllowlist no admite textos vacíos ni espacios alrededor',
      'remoteAllowlist tiene duplicados',
    ),
  };
  const withOptional = {
    ...parsed,
    ...(assetsVersion !== undefined ? { assetsVersion } : {}),
    ...(assets !== undefined ? { assets } : {}),
    ...(commandLog !== undefined ? { commandLog } : {}),
  };
  return withOptional;
}

function parseCommandLogConfig(value: unknown): VaultConfig['commandLog'] {
  if (!isRecord(value)) {
    throw configInvalid('commandLog tiene que ser un objeto');
  }
  assertExactKeys(value, ['enabled'], 'commandLog tiene que tener exactamente la clave enabled');
  if (typeof value.enabled !== 'boolean') {
    throw configInvalid('commandLog.enabled tiene que ser booleano');
  }
  return { enabled: value.enabled };
}

function parseAssetHashes(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw configInvalid('assets tiene que ser un objeto');
  }
  const entries = Object.entries(value);
  const assets: Record<string, string> = {};
  for (const [path, hash] of entries) {
    if (path.trim() === '' || path.includes('\0')) {
      throw configInvalid('assets admite solo rutas relativas dentro del vault');
    }
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) {
      throw configInvalid('assets tiene que mapear rutas a hashes sha256 en hex');
    }
    if (assets[path] !== undefined) {
      throw configInvalid('assets tiene claves duplicadas');
    }
    assets[path] = hash;
  }
  return assets;
}

export async function readVaultConfig(vaultRoot: string): Promise<VaultConfig> {
  await assertGavetaDirectory(vaultRoot);
  let text: string;
  try {
    text = await readVaultText(vaultRoot, VAULT_CONFIG_PATH);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      throw configInvalid('no existe .gaveta/config.json');
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw configInvalid('no es JSON');
  }
  return parseVaultConfig(parsed);
}

export async function writeVaultConfig(vaultRoot: string, config: unknown): Promise<void> {
  const parsed = parseVaultConfig(config);
  await assertGavetaDirectory(vaultRoot);
  try {
    await writeVaultText(vaultRoot, VAULT_CONFIG_PATH, serializeVaultConfig(parsed));
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      throw vaultNotFound();
    }
    throw error;
  }
}

function serializeVaultConfig(config: VaultConfig): string {
  const body: Record<string, unknown> = {
    rel: {
      strict: config.rel.strict,
      vocabulary: config.rel.vocabulary,
    },
    remoteAllowlist: config.remoteAllowlist,
  };
  if (config.assetsVersion !== undefined) {
    body.assetsVersion = config.assetsVersion;
  }
  if (config.assets !== undefined && Object.keys(config.assets).length > 0) {
    body.assets = config.assets;
  }
  if (config.commandLog !== undefined) {
    body.commandLog = { enabled: config.commandLog.enabled };
  }
  return `${JSON.stringify(body, null, 2)}\n`;
}

async function assertGavetaDirectory(vaultRoot: string): Promise<void> {
  let root: string;
  try {
    root = await realpath(vaultRoot);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT') || hasNodeErrorCode(error, 'ENOTDIR')) {
      throw vaultNotFound();
    }
    throw error;
  }
  const marker = path.join(root, GAVETA_DIRECTORY);
  let listed;
  try {
    listed = await lstat(marker);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      throw vaultNotFound();
    }
    throw error;
  }
  if (listed.isSymbolicLink()) {
    let real: string;
    try {
      real = await realpath(marker);
    } catch (error) {
      if (hasNodeErrorCode(error, 'ENOENT') || hasNodeErrorCode(error, 'ELOOP')) {
        throw pathOutsideVault();
      }
      throw error;
    }
    if (!isInsideVault(root, real)) {
      throw pathOutsideVault();
    }
    const target = await stat(real);
    if (!target.isDirectory()) {
      throw vaultNotFound();
    }
    return;
  }
  if (!listed.isDirectory()) {
    throw vaultNotFound();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  detail: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(record);
  for (const key of required) {
    if (!actual.includes(key)) {
      throw configInvalid(detail);
    }
  }
  if (actual.some((key) => !allowed.has(key))) {
    throw configInvalid(detail);
  }
}

function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  detail: string,
): void {
  assertAllowedKeys(record, keys, [], detail);
}

function parseStringList(
  value: unknown,
  typeDetail: string,
  blankDetail: string,
  duplicateDetail: string,
): string[] {
  if (!Array.isArray(value)) {
    throw configInvalid(typeDetail);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw configInvalid(typeDetail);
    }
    if (item.trim() === '' || item.trim() !== item) {
      throw configInvalid(blankDetail);
    }
    items.push(item);
  }
  if (new Set(items).size !== items.length) {
    throw configInvalid(duplicateDetail);
  }
  return items;
}
