import type { AesGcmBlob } from '@/types/domain'
import { base64ToBytes, bytesToBase64 } from '@/utils/bytes'
import { AES_GCM_IV_BYTES, DEK_BITS } from './constants'
import { CryptoError } from './errors'
import { getRandomValues, getSubtle } from './webCrypto'

export async function generateDek(): Promise<CryptoKey> {
  return getSubtle().generateKey(
    { name: 'AES-GCM', length: DEK_BITS },
    true,
    ['encrypt', 'decrypt'],
  )
}

export async function exportDekRaw(dek: CryptoKey): Promise<Uint8Array> {
  const raw = await getSubtle().exportKey('raw', dek)
  return new Uint8Array(raw)
}

export async function importDekRaw(raw: Uint8Array): Promise<CryptoKey> {
  const copy = Uint8Array.from(raw)
  return getSubtle().importKey(
    'raw',
    copy,
    { name: 'AES-GCM', length: DEK_BITS },
    true,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptAesGcm(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<AesGcmBlob> {
  const iv = getRandomValues(AES_GCM_IV_BYTES)
  const plaintextCopy = Uint8Array.from(plaintext)
  const ciphertext = await getSubtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextCopy,
  )
  return {
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptAesGcm(
  key: CryptoKey,
  blob: AesGcmBlob,
): Promise<Uint8Array> {
  try {
    const iv = base64ToBytes(blob.ivB64)
    const ciphertext = base64ToBytes(blob.ciphertextB64)
    const plain = await getSubtle().decrypt(
      { name: 'AES-GCM', iv: Uint8Array.from(iv) },
      key,
      Uint8Array.from(ciphertext),
    )
    return new Uint8Array(plain)
  } catch (cause) {
    throw new CryptoError('TAMPERED', 'AES-GCM decryption failed (wrong key or tampered data)', {
      cause,
    })
  }
}
