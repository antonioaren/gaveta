import { resolveSeedVaultRoot, seedDevVault } from '../tests/lib/seed-dev-vault.ts';

const target = resolveSeedVaultRoot(process.argv[2]);
await seedDevVault(target);
console.info(`Vault de demo listo en ${target}`);
