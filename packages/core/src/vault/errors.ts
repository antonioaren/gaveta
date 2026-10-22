import { GavetaError } from '../errors.ts';

export function vaultNotFound(): GavetaError {
  return new GavetaError('E_VAULT_NOT_FOUND');
}

export function pathOutsideVault(): GavetaError {
  return new GavetaError('E_PATH_OUTSIDE_VAULT');
}

export function configInvalid(detail: string): GavetaError {
  return new GavetaError('E_CONFIG_INVALID', { detail });
}
