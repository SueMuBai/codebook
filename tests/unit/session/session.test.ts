import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { createPinia, setActivePinia } from 'pinia'
import { createVault } from '@/features/crypto'
import { encryptAesGcm } from '@/features/crypto/aes'
import { getDatabase, resetDatabaseForTests } from '@/services/database'
import { useSessionStore } from '@/stores/session'
import { useVaultStore } from '@/stores/vault'
import type { VaultRecord } from '@/types/domain'
import { utf8ToBytes } from '@/utils/bytes'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

describe('session store', () => {
  beforeEach(async () => {
    await resetDatabaseForTests()
    const db = await getDatabase()
    await db.clearLocalData()
    setActivePinia(createPinia())
  })

  it('creates new vaults with a strict six-digit PIN marker', async () => {
    const session = useSessionStore()
    await expect(session.setup('password')).rejects.toThrow('主 PIN 必须为 6 位数字')
    await expect(session.setup('12345')).rejects.toThrow('主 PIN 必须为 6 位数字')

    await session.setup('012345')
    expect(session.record?.meta.credentialType).toBe('pin')
    session.lock()
    await expect(session.unlock('01234')).rejects.toThrow('主 PIN 必须为 6 位数字')
    await session.unlock('012345')
    expect(session.isUnlocked).toBe(true)
  })

  it('keeps legacy passwords unlockable and migrates them when changed to a PIN', async () => {
    const legacy = await createVault('legacy-long-password', { iterations: 100_000 })
    await (await getDatabase()).saveVaultRecord(legacy.record)
    const session = useSessionStore()
    await session.bootstrap()
    await session.unlock('legacy-long-password')

    await expect(
      session.changeMasterPassword('legacy-long-password', 'new-password'),
    ).rejects.toThrow('主 PIN 必须为 6 位数字')
    await session.changeMasterPassword('legacy-long-password', '654321')
    expect(session.record?.meta.credentialType).toBe('pin')

    session.lock()
    await expect(session.unlock('legacy-long-password')).rejects.toThrow(
      '主 PIN 必须为 6 位数字',
    )
    await session.unlock('654321')
    expect(session.isUnlocked).toBe(true)
  })

  it('keeps legacy backup passwords compatible without replacing data after a failed attempt', async () => {
    const current = await createVault('current-password', { iterations: 100_000 })
    const imported = await createVault('backup-password', { iterations: 100_000 })
    const db = await getDatabase()
    await db.saveVaultRecord(current.record)

    const session = useSessionStore()
    await session.bootstrap()
    await session.unlock('current-password')
    await expect(session.importVault(imported.record, 'wrong-password')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    })
    expect(await db.getVaultRecord()).toEqual(current.record)
    expect(session.isUnlocked).toBe(true)

    await session.importVault(imported.record, 'backup-password')
    expect(await db.getVaultRecord()).toEqual(imported.record)
    expect(session.status).toBe('locked')
    await session.unlock('backup-password')
    expect(session.isUnlocked).toBe(true)
  })

  it('locks by clearing sensitive state', async () => {
    const current = await createVault('current-password', { iterations: 100_000 })
    await (await getDatabase()).saveVaultRecord(current.record)
    const session = useSessionStore()
    await session.bootstrap()
    await session.unlock('current-password')
    expect(session.payload).not.toBeNull()
    session.lock()
    expect(session.payload).toBeNull()
    expect(session.dek).toBeNull()
    expect(session.status).toBe('locked')
  })

  it('persists and reloads every editable entry and settings field', async () => {
    const current = await createVault('current-password', { iterations: 100_000 })
    await (await getDatabase()).saveVaultRecord(current.record)
    const session = useSessionStore()
    await session.bootstrap()
    await session.unlock('current-password')
    const vault = useVaultStore()

    const category = await vault.upsertCategory({ name: '工作', color: '#668cff' })
    const mail = await vault.upsertEntry({ title: '邮箱', username: 'mail@example.com' })
    const entry = await vault.upsertEntry({
      title: '完整条目',
      categoryId: category.id,
      url: 'https://example.com',
      username: 'alice',
      password: 'secret',
      notes: 'note',
      favorite: true,
      totp: [
        {
          id: 'totp',
          secret: 'JBSWY3DPEHPK3PXP',
          issuer: 'Example',
          accountName: 'alice',
          label: '主账号',
          digits: 8,
          period: 45,
          algorithm: 'SHA256',
        },
      ],
      linkedEmails: [
        vault.createEntryLink(mail.id),
        { kind: 'text', email: 'backup@example.com', note: '备用' },
      ],
      customFields: [{ id: 'field', name: '恢复码', value: 'ABC-123', masked: true }],
      lastUsedAt: 100,
    })
    await vault.markEntryUsed(entry.id, 200)
    await session.saveSettings({
      autoLockSeconds: 30,
      clipboardClearSeconds: 15,
      theme: 'dark',
      totpRevealSeconds: 10,
      screenProtectionEnabled: false,
    })

    session.lock()
    await session.unlock('current-password')
    expect(vault.getEntry(entry.id)).toMatchObject({
      categoryId: category.id,
      title: '完整条目',
      url: 'https://example.com',
      username: 'alice',
      password: 'secret',
      notes: 'note',
      favorite: true,
      lastUsedAt: 200,
    })
    expect(vault.getEntry(entry.id)?.totp).toHaveLength(1)
    expect(vault.getEntry(entry.id)?.linkedEmails).toHaveLength(2)
    expect(vault.getEntry(entry.id)?.customFields).toHaveLength(1)
    expect(session.settings).toEqual({
      autoLockSeconds: 30,
      clipboardClearSeconds: 15,
      theme: 'dark',
      totpRevealSeconds: 10,
      screenProtectionEnabled: false,
    })
  })

  it('persists category deletion and linked-entry degradation atomically', async () => {
    const current = await createVault('current-password', { iterations: 100_000 })
    await (await getDatabase()).saveVaultRecord(current.record)
    const session = useSessionStore()
    await session.bootstrap()
    await session.unlock('current-password')
    const vault = useVaultStore()
    const category = await vault.upsertCategory({ name: '工作' })
    const mail = await vault.upsertEntry({ title: '邮箱', username: 'mail@example.com' })
    const site = await vault.upsertEntry({
      title: '网站',
      categoryId: category.id,
      linkedEmails: [vault.createEntryLink(mail.id)],
    })

    await vault.deleteCategory(category.id)
    await vault.deleteEntry(mail.id)
    session.lock()
    await session.unlock('current-password')

    expect(vault.categories).toHaveLength(0)
    expect(vault.getEntry(site.id)).toMatchObject({
      categoryId: undefined,
      linkedEmails: [
        { kind: 'text', email: 'mail@example.com', note: '原关联记录已删除' },
      ],
    })
  })

  it('offers the reset flow for incompatible vault and payload versions', async () => {
    const db = await getDatabase()
    const legacyRecord = await createVault('current-password', { iterations: 100_000 })
    await db.saveVaultRecord({
      ...legacyRecord.record,
      meta: { ...legacyRecord.record.meta, version: 1 },
    } as unknown as VaultRecord)

    const legacyMetaSession = useSessionStore()
    await legacyMetaSession.bootstrap()
    expect(legacyMetaSession.status).toBe('legacy_reset_required')

    await db.clearLocalData()
    setActivePinia(createPinia())
    const legacyPayload = await createVault('current-password', { iterations: 100_000 })
    const cipher = await encryptAesGcm(
      legacyPayload.dek,
      utf8ToBytes(JSON.stringify({ ...legacyPayload.payload, schemaVersion: 1 })),
    )
    await db.saveVaultRecord({ ...legacyPayload.record, cipher })
    const legacyPayloadSession = useSessionStore()
    await legacyPayloadSession.bootstrap()
    await expect(legacyPayloadSession.unlock('current-password')).rejects.toMatchObject({
      code: 'UNSUPPORTED_VERSION',
    })
    expect(legacyPayloadSession.status).toBe('legacy_reset_required')
  })
})
