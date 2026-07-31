import { beforeAll, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  assertVaultRecord,
  createVault,
  persistPayload,
  rewrapVaultPassword,
  unlockVault,
} from '@/features/crypto'
import type { VaultRecord } from '@/types/domain'
import { base64ToBytes, bytesToBase64 } from '@/utils/bytes'

const TEST_ITERATIONS = 100_000

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
})

describe('vault v2 crypto', () => {
  it('creates and unlocks a v2 vault record', async () => {
    const created = await createVault('correct horse battery staple', {
      iterations: TEST_ITERATIONS,
      now: 100,
    })
    expect(created.record.meta.version).toBe(2)
    expect(created.payload.schemaVersion).toBe(2)
    expect((await unlockVault('correct horse battery staple', created.record)).payload).toEqual(
      created.payload,
    )
  })

  it('rejects a wrong password', async () => {
    const created = await createVault('right-password', { iterations: TEST_ITERATIONS })
    await expect(unlockVault('wrong-password', created.record)).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    })
  })

  it('rejects an unsupported v1 record distinctly', async () => {
    const created = await createVault('password', { iterations: TEST_ITERATIONS })
    const legacy = {
      ...created.record,
      meta: { ...created.record.meta, version: 1 },
    } as unknown as VaultRecord
    await expect(unlockVault('password', legacy)).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    })
  })

  it('rejects non-canonical Base64 and invalid metadata timestamps', async () => {
    const created = await createVault('password', { iterations: TEST_ITERATIONS, now: 100 })
    expect(() =>
      assertVaultRecord({
        ...created.record,
        meta: {
          ...created.record.meta,
          kdf: { ...created.record.meta.kdf, saltB64: ` ${created.record.meta.kdf.saltB64}` },
        },
      }),
    ).toThrow('Base64')
    expect(() =>
      assertVaultRecord({
        ...created.record,
        meta: { ...created.record.meta, updatedAt: 99 },
      }),
    ).toThrow('时间戳')
  })

  it('detects tampered ciphertext', async () => {
    const created = await createVault('secret-password', { iterations: TEST_ITERATIONS })
    const tampered: VaultRecord = {
      ...created.record,
      cipher: {
        ...created.record.cipher,
        ciphertextB64: corrupt(created.record.cipher.ciphertextB64),
      },
    }
    await expect(unlockVault('secret-password', tampered)).rejects.toMatchObject({ code: 'TAMPERED' })
  })

  it('persists normalized collections under the same DEK', async () => {
    const created = await createVault('secret-password', { iterations: TEST_ITERATIONS, now: 1 })
    const nextPayload = {
      ...created.payload,
      entries: [
        {
          id: 'entry-1',
          title: 'Example',
          favorite: false,
          totp: [],
          linkedEmails: [],
          customFields: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }
    const record = await persistPayload(created.dek, created.record, nextPayload, 2)
    expect(record.meta.updatedAt).toBe(2)
    expect((await unlockVault('secret-password', record)).payload.entries).toHaveLength(1)
  })

  it('rewraps the DEK when changing the master password', async () => {
    const created = await createVault('old-password', { iterations: TEST_ITERATIONS, now: 100 })
    const changed = await rewrapVaultPassword(
      'old-password',
      'new-password',
      created.record,
      999,
    )
    await expect(unlockVault('old-password', changed.record)).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    })
    expect(changed.record.cipher).toEqual(created.record.cipher)
    expect((await unlockVault('new-password', changed.record)).payload).toEqual(created.payload)
  })
})

function corrupt(value: string): string {
  const bytes = base64ToBytes(value)
  bytes[0] = (bytes[0]! ^ 0xff) & 0xff
  return bytesToBase64(bytes)
}
