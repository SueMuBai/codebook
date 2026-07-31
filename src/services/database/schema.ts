export const DATABASE_NAME = 'codebook_vault'
export const DATABASE_VERSION = 1

export const NATIVE_SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`

export const KV_KEYS = {
  vaultRecord: 'vault_record_v2',
  settings: 'settings_v2',
  legacyMeta: 'vault_meta',
  legacyCipher: 'vault_cipher',
  legacySettings: 'settings',
} as const
