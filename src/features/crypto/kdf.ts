import { base64ToBytes, bytesToBase64 } from '@/utils/bytes'
import {
  DEFAULT_PBKDF2_ITERATIONS,
  SALT_BYTES,
} from './constants'
import { CryptoError } from './errors'
import { getRandomValues, getSubtle } from './webCrypto'

export interface DeriveKekOptions {
  password: string
  salt: Uint8Array
  iterations?: number
}

export function generateSalt(byteLength: number = SALT_BYTES): Uint8Array {
  return getRandomValues(byteLength)
}

export function saltToBase64(salt: Uint8Array): string {
  return bytesToBase64(salt)
}

export function saltFromBase64(saltB64: string): Uint8Array {
  return base64ToBytes(saltB64)
}

/**
 * Derive AES-GCM key-encryption-key (KEK) from master password via PBKDF2-SHA-256.
 */
export async function deriveKek(options: DeriveKekOptions): Promise<CryptoKey> {
  const password = options.password
  if (!password) {
    throw new CryptoError('EMPTY_PASSWORD', 'Master password must not be empty')
  }

  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new CryptoError('INVALID_PAYLOAD', 'Invalid PBKDF2 iteration count')
  }

  const subtle = getSubtle()
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  // Copy into a fresh ArrayBuffer-backed view (avoids SharedArrayBuffer typing issues).
  const saltCopy = Uint8Array.from(options.salt)

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltCopy,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
