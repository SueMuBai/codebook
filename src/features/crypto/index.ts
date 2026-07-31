export { CryptoError, isCryptoError } from './errors'
export type { CryptoErrorCode } from './errors'
export {
  BACKUP_PACKAGE_VERSION,
  DEFAULT_PBKDF2_ITERATIONS,
  PAYLOAD_SCHEMA_VERSION,
  VAULT_FORMAT_VERSION,
} from './constants'
export { deriveKek, generateSalt, saltFromBase64, saltToBase64 } from './kdf'
export {
  decryptAesGcm,
  encryptAesGcm,
  exportDekRaw,
  generateDek,
  importDekRaw,
} from './aes'
export {
  assertVaultRecord,
  createEmptyPayload,
  createVault,
  openPayload,
  persistPayload,
  rewrapVaultPassword,
  sealPayload,
  unlockVault,
} from './vaultCodec'
export type { CreateVaultOptions, CreatedVault, UnlockedVault } from './vaultCodec'
