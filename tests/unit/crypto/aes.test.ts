import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  decryptAesGcm,
  encryptAesGcm,
  generateDek,
} from '@/features/crypto'
import { utf8ToBytes, bytesToUtf8 } from '@/utils/bytes'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
    })
  }
})

describe('AES-GCM helpers', () => {
  it('encrypts and decrypts arbitrary bytes', async () => {
    const key = await generateDek()
    const plain = utf8ToBytes('密语 · codebook')
    const blob = await encryptAesGcm(key, plain)
    expect(blob.ivB64).toBeTruthy()
    expect(blob.ciphertextB64).toBeTruthy()
    expect(blob.ciphertextB64).not.toContain(bytesToUtf8(plain))

    const opened = await decryptAesGcm(key, blob)
    expect(bytesToUtf8(opened)).toBe('密语 · codebook')
  })
})
