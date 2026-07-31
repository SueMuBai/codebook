import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createVault } from '@/features/crypto'
import { IndexedDbAdapter } from '@/services/database/IndexedDbAdapter'
import { DEFAULT_APP_SETTINGS } from '@/types/domain'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

describe('IndexedDbAdapter v2', () => {
  let db: IndexedDbAdapter

  beforeEach(async () => {
    db = new IndexedDbAdapter()
    await db.initialize()
    await db.clearLocalData()
  })

  afterEach(async () => db.close())

  it('starts empty with secure default settings', async () => {
    expect(await db.getVaultRecord()).toBeNull()
    expect(await db.getSettings()).toEqual(DEFAULT_APP_SETTINGS)
  })

  it('persists an atomic vault record across reopen', async () => {
    const created = await createVault('database-password', { iterations: 100_000 })
    await db.saveVaultRecord(created.record)
    await db.close()
    const reopened = new IndexedDbAdapter()
    await reopened.initialize()
    expect(await reopened.getVaultRecord()).toEqual(created.record)
    db = reopened
  })

  it('replaces vault and settings together', async () => {
    const created = await createVault('database-password', { iterations: 100_000 })
    const settings = { ...DEFAULT_APP_SETTINGS, theme: 'dark' as const, autoLockSeconds: 30 }
    await db.replaceAll(created.record, settings)
    expect(await db.getVaultRecord()).toEqual(created.record)
    expect(await db.getSettings()).toEqual(settings)
  })

  it('clears v2 state', async () => {
    const created = await createVault('database-password', { iterations: 100_000 })
    await db.replaceAll(created.record, { ...DEFAULT_APP_SETTINGS, theme: 'light' })
    await db.clearLocalData()
    expect(await db.getVaultRecord()).toBeNull()
    expect(await db.getSettings()).toEqual(DEFAULT_APP_SETTINGS)
  })
})
