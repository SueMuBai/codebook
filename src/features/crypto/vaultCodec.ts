import { normalizeVaultPayload } from '@/features/vault'
import type { VaultMeta, VaultPayload, VaultRecord } from '@/types/domain'
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from '@/utils/bytes'
import {
  decryptAesGcm,
  encryptAesGcm,
  exportDekRaw,
  generateDek,
  importDekRaw,
} from './aes'
import {
  DEFAULT_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  PAYLOAD_SCHEMA_VERSION,
  VAULT_FORMAT_VERSION,
} from './constants'
import { CryptoError } from './errors'
import { deriveKek, generateSalt, saltFromBase64, saltToBase64 } from './kdf'

export interface CreatedVault {
  record: VaultRecord
  dek: CryptoKey
  payload: VaultPayload
}

export interface UnlockedVault {
  dek: CryptoKey
  payload: VaultPayload
}

export function createEmptyPayload(): VaultPayload {
  return {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    categories: [],
    entries: [],
  }
}

function assertBase64(
  value: unknown,
  label: string,
  options: { minimumBytes?: number; exactBytes?: number },
): asserts value is string {
  if (typeof value !== 'string' || !value) {
    throw new CryptoError('INVALID_PAYLOAD', `${label} 缺失`)
  }
  try {
    if (
      !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(value)
    ) {
      throw new Error('invalid alphabet or padding')
    }
    const decoded = base64ToBytes(value)
    if (bytesToBase64(decoded) !== value) throw new Error('non-canonical encoding')
    if (options.exactBytes !== undefined && decoded.byteLength !== options.exactBytes) {
      throw new Error('wrong length')
    }
    if (options.minimumBytes !== undefined && decoded.byteLength < options.minimumBytes) {
      throw new Error('too short')
    }
  } catch (cause) {
    throw new CryptoError('INVALID_PAYLOAD', `${label} 不是有效 Base64`, { cause })
  }
}

export function assertVaultRecord(value: unknown): asserts value is VaultRecord {
  if (!value || typeof value !== 'object') {
    throw new CryptoError('INVALID_PAYLOAD', 'vault record 必须是对象')
  }
  const record = value as Partial<VaultRecord>
  const meta = record.meta as Partial<VaultMeta> | undefined
  if (!meta || !record.cipher) throw new CryptoError('INVALID_PAYLOAD', 'vault record 不完整')
  if (meta.version !== VAULT_FORMAT_VERSION) {
    throw new CryptoError('UNSUPPORTED_VERSION', `不支持的 vault 版本：${String(meta.version)}`)
  }
  if (meta.credentialType !== undefined && meta.credentialType !== 'pin') {
    throw new CryptoError('INVALID_PAYLOAD', 'vault 凭据类型无效')
  }
  if (meta.kdf?.algorithm !== 'PBKDF2' || meta.kdf.hash !== 'SHA-256') {
    throw new CryptoError('UNSUPPORTED_VERSION', '不支持的 KDF')
  }
  if (
    !Number.isInteger(meta.kdf.iterations) ||
    meta.kdf.iterations < MIN_PBKDF2_ITERATIONS ||
    meta.kdf.iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new CryptoError('INVALID_PAYLOAD', 'PBKDF2 迭代次数无效')
  }
  const createdAt = meta.createdAt
  const updatedAt = meta.updatedAt
  if (
    typeof createdAt !== 'number' ||
    typeof updatedAt !== 'number' ||
    !Number.isSafeInteger(createdAt) ||
    !Number.isSafeInteger(updatedAt) ||
    createdAt < 0 ||
    updatedAt < createdAt
  ) {
    throw new CryptoError('INVALID_PAYLOAD', 'vault 时间戳无效')
  }
  assertBase64(meta.kdf.saltB64, 'KDF salt', { exactBytes: 16 })
  assertBase64(meta.wrappedDek?.ivB64, 'wrapped DEK iv', { exactBytes: 12 })
  assertBase64(meta.wrappedDek?.ciphertextB64, 'wrapped DEK ciphertext', {
    exactBytes: 48,
  })
  assertBase64(record.cipher.ivB64, 'vault iv', { exactBytes: 12 })
  assertBase64(record.cipher.ciphertextB64, 'vault ciphertext', { minimumBytes: 16 })
}

export async function sealPayload(dek: CryptoKey, payload: VaultPayload): Promise<VaultRecord['cipher']> {
  const normalized = normalizeVaultPayload(payload)
  return encryptAesGcm(dek, utf8ToBytes(JSON.stringify(normalized)))
}

export async function openPayload(dek: CryptoKey, cipher: VaultRecord['cipher']): Promise<VaultPayload> {
  const plain = await decryptAesGcm(dek, cipher)
  try {
    return normalizeVaultPayload(JSON.parse(bytesToUtf8(plain)) as unknown)
  } catch (cause) {
    if (cause instanceof CryptoError) throw cause
    if (cause instanceof Error && cause.message.startsWith('不支持的 payload 版本')) {
      throw new CryptoError('UNSUPPORTED_VERSION', cause.message, { cause })
    }
    throw new CryptoError('INVALID_PAYLOAD', cause instanceof Error ? cause.message : '保险箱内容无效', {
      cause,
    })
  }
}

async function wrapDek(kek: CryptoKey, dek: CryptoKey): Promise<VaultMeta['wrappedDek']> {
  return encryptAesGcm(kek, await exportDekRaw(dek))
}

async function unwrapDek(kek: CryptoKey, wrappedDek: VaultMeta['wrappedDek']): Promise<CryptoKey> {
  try {
    return importDekRaw(await decryptAesGcm(kek, wrappedDek))
  } catch (cause) {
    throw new CryptoError('WRONG_PASSWORD', '主密码错误', { cause })
  }
}

export interface CreateVaultOptions {
  iterations?: number
  now?: number
}

export async function createVault(password: string, options: CreateVaultOptions = {}): Promise<CreatedVault> {
  if (!password) throw new CryptoError('EMPTY_PASSWORD', '主密码不能为空')
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new CryptoError('INVALID_PAYLOAD', 'PBKDF2 迭代次数无效')
  }

  const now = options.now ?? Date.now()
  const salt = generateSalt()
  const kek = await deriveKek({ password, salt, iterations })
  const dek = await generateDek()
  const payload = createEmptyPayload()
  const record: VaultRecord = {
    meta: {
      version: VAULT_FORMAT_VERSION,
      kdf: {
        algorithm: 'PBKDF2',
        hash: 'SHA-256',
        iterations,
        saltB64: saltToBase64(salt),
      },
      wrappedDek: await wrapDek(kek, dek),
      createdAt: now,
      updatedAt: now,
    },
    cipher: await sealPayload(dek, payload),
  }
  return { record, dek, payload }
}

export async function unlockVault(password: string, record: VaultRecord): Promise<UnlockedVault> {
  if (!password) throw new CryptoError('EMPTY_PASSWORD', '主密码不能为空')
  assertVaultRecord(record)
  const kek = await deriveKek({
    password,
    salt: saltFromBase64(record.meta.kdf.saltB64),
    iterations: record.meta.kdf.iterations,
  })
  const dek = await unwrapDek(kek, record.meta.wrappedDek)
  try {
    return { dek, payload: await openPayload(dek, record.cipher) }
  } catch (error) {
    if (error instanceof CryptoError && error.code === 'TAMPERED') {
      throw new CryptoError('TAMPERED', '保险箱密文已损坏', { cause: error })
    }
    throw error
  }
}

export async function persistPayload(
  dek: CryptoKey,
  record: VaultRecord,
  payload: VaultPayload,
  now: number = Date.now(),
): Promise<VaultRecord> {
  assertVaultRecord(record)
  return {
    meta: { ...record.meta, updatedAt: now },
    cipher: await sealPayload(dek, payload),
  }
}

export async function rewrapVaultPassword(
  currentPassword: string,
  newPassword: string,
  record: VaultRecord,
  now: number = Date.now(),
): Promise<{ record: VaultRecord; dek: CryptoKey; payload: VaultPayload }> {
  if (!newPassword) throw new CryptoError('EMPTY_PASSWORD', '新主密码不能为空')
  const unlocked = await unlockVault(currentPassword, record)
  const salt = generateSalt()
  const kek = await deriveKek({ password: newPassword, salt, iterations: DEFAULT_PBKDF2_ITERATIONS })
  return {
    record: {
      meta: {
        ...record.meta,
        kdf: {
          algorithm: 'PBKDF2',
          hash: 'SHA-256',
          iterations: DEFAULT_PBKDF2_ITERATIONS,
          saltB64: saltToBase64(salt),
        },
        wrappedDek: await wrapDek(kek, unlocked.dek),
        updatedAt: now,
      },
      cipher: record.cipher,
    },
    dek: unlocked.dek,
    payload: unlocked.payload,
  }
}
