export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'
export type TotpDigits = 6 | 7 | 8
export type ThemeMode = 'auto' | 'light' | 'dark'

export interface KdfParams {
  algorithm: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
  saltB64: string
}

export interface AesGcmBlob {
  ivB64: string
  ciphertextB64: string
}

export interface VaultMeta {
  version: 2
  /** Missing on vaults created before the six-digit PIN flow. */
  credentialType?: 'pin'
  kdf: KdfParams
  wrappedDek: AesGcmBlob
  createdAt: number
  updatedAt: number
}

export type VaultCipher = AesGcmBlob

/** The smallest atomic persistence and backup unit. */
export interface VaultRecord {
  meta: VaultMeta
  cipher: VaultCipher
}

export interface Category {
  id: string
  name: string
  color?: string
  sortOrder: number
}

export interface TotpSecret {
  id: string
  secret: string
  issuer?: string
  accountName?: string
  digits: TotpDigits
  period: number
  algorithm: TotpAlgorithm
  label?: string
}

export type LinkedEmailRef =
  | {
      kind: 'entry'
      entryId: string
      labelSnapshot: string
      emailSnapshot?: string
    }
  | {
      kind: 'text'
      email: string
      note?: string
    }

export interface CustomField {
  id: string
  name: string
  value: string
  masked: boolean
}

export interface CredentialEntry {
  id: string
  categoryId?: string
  title: string
  url?: string
  username?: string
  password?: string
  notes?: string
  favorite: boolean
  totp: TotpSecret[]
  linkedEmails: LinkedEmailRef[]
  customFields: CustomField[]
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
}

export interface VaultPayload {
  schemaVersion: 2
  categories: Category[]
  entries: CredentialEntry[]
}

export interface AppSettings {
  autoLockSeconds: number
  clipboardClearSeconds: number
  theme: ThemeMode
  totpRevealSeconds: number
  screenProtectionEnabled: boolean
}

export interface PortableSettings {
  autoLockSeconds: number
  clipboardClearSeconds: number
  theme: ThemeMode
  totpRevealSeconds: number
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoLockSeconds: 90,
  clipboardClearSeconds: 30,
  theme: 'auto',
  totpRevealSeconds: 10,
  screenProtectionEnabled: true,
}

export function toPortableSettings(settings: AppSettings): PortableSettings {
  return {
    autoLockSeconds: settings.autoLockSeconds,
    clipboardClearSeconds: settings.clipboardClearSeconds,
    theme: settings.theme,
    totpRevealSeconds: settings.totpRevealSeconds,
  }
}
